import { Injectable } from '@nestjs/common';
import { Prisma, StatusEmprestimo } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Dados juntados em cada empréstimo para exibição (sem o hash de senha, nunca).
const DETALHES = {
  equipamento: { select: { id: true, codigo: true, nome: true } },
  usuario: { select: { id: true, codigo: true, nome: true, email: true, telefone: true } },
} satisfies Prisma.EmprestimoInclude;

export type EmprestimoDetalhado = Prisma.EmprestimoGetPayload<{ include: typeof DETALHES }>;

export type ResultadoRetirada =
  | { tipo: 'criado'; emprestimo: EmprestimoDetalhado }
  | { tipo: 'inexistente' }
  | { tipo: 'inativo' }
  | { tipo: 'indisponivel' };

export interface FiltroEmprestimos {
  usuarioId?: number;
  equipamentoId?: number;
  status?: StatusEmprestimo;
  atrasados?: boolean;
  /** Parte do nome do equipamento. */
  busca?: string;
  /** Também procura a busca no nome e no e-mail de quem pegou (só para quem pode ver todos os empréstimos). */
  buscarPessoa?: boolean;
}

@Injectable()
export class EmprestimosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra a retirada de forma ATÔMICA. Duas proteções, em camadas:
   *  1. a linha do equipamento é travada (FOR UPDATE): pedidos simultâneos pelo MESMO item entram em fila
   *     e cada um enxerga o resultado do anterior;
   *  2. mesmo que a trava falhasse, o índice único parcial do banco (um ATIVO por equipamento) recusa o segundo.
   */
  async criarSeDisponivel(usuarioId: number, equipamentoId: number, prazoDevolucao: Date): Promise<ResultadoRetirada> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const linhas = await tx.$queryRaw<{ ativo: boolean }[]>`
          SELECT "ativo" FROM "Equipamento" WHERE "id" = ${equipamentoId} FOR UPDATE`;
        if (linhas.length === 0) return { tipo: 'inexistente' } as const;
        if (!linhas[0].ativo) return { tipo: 'inativo' } as const;

        const jaEmprestado = await tx.emprestimo.count({ where: { equipamentoId, status: StatusEmprestimo.ATIVO } });
        if (jaEmprestado > 0) return { tipo: 'indisponivel' } as const;

        const emprestimo = await tx.emprestimo.create({
          data: { usuarioId, equipamentoId, prazoDevolucao },
          include: DETALHES,
        });
        return { tipo: 'criado', emprestimo } as const;
      });
    } catch (erro) {
      // Última barreira: o índice único do banco recusou um segundo empréstimo ativo.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002')
        return { tipo: 'indisponivel' };
      throw erro;
    }
  }

  buscarPorId(id: number): Promise<EmprestimoDetalhado | null> {
    return this.prisma.emprestimo.findUnique({ where: { id }, include: DETALHES });
  }

  /**
   * Marca como devolvido de forma ATÔMICA: a condição "ainda está ATIVO" faz parte do próprio UPDATE.
   * Devolve false se outro pedido devolveu antes (devolução dupla simultânea).
   */
  async marcarDevolvido(id: number, quando: Date): Promise<boolean> {
    const { count } = await this.prisma.emprestimo.updateMany({
      where: { id, status: StatusEmprestimo.ATIVO },
      data: { status: StatusEmprestimo.DEVOLVIDO, dataDevolucao: quando },
    });
    return count === 1;
  }

  /**
   * Estende o prazo de um empréstimo. As condições (ativo, no prazo, abaixo do limite) estão DENTRO do UPDATE:
   * duas renovações simultâneas nunca passam do limite. Devolve false se alguma condição falhou.
   * O lembrete e o aviso de atraso são zerados: o novo prazo merece os seus próprios avisos.
   */
  async renovar(id: number, dias: number, maxRenovacoes: number, agora: Date): Promise<boolean> {
    const atual = await this.prisma.emprestimo.findUnique({ where: { id }, select: { prazoDevolucao: true } });
    if (!atual) return false;
    const novoPrazo = new Date(atual.prazoDevolucao.getTime() + dias * 24 * 3_600_000);
    const { count } = await this.prisma.emprestimo.updateMany({
      where: {
        id,
        status: StatusEmprestimo.ATIVO,
        renovacoes: { lt: maxRenovacoes },
        prazoDevolucao: { gte: agora, equals: atual.prazoDevolucao }, // o prazo lido continua o mesmo
      },
      data: {
        prazoDevolucao: novoPrazo,
        renovacoes: { increment: 1 },
        lembreteEnviadoEm: null,
        ultimoAvisoAtrasoEm: null,
      },
    });
    return count === 1;
  }

  async listar(filtro: FiltroEmprestimos, intervalo: { skip: number; take: number }) {
    const where: Prisma.EmprestimoWhereInput = {
      ...(filtro.usuarioId !== undefined && { usuarioId: filtro.usuarioId }),
      ...(filtro.equipamentoId !== undefined && { equipamentoId: filtro.equipamentoId }),
      ...(filtro.status && { status: filtro.status }),
      // Atrasado = ainda ATIVO e com o prazo vencido.
      ...(filtro.atrasados && { status: StatusEmprestimo.ATIVO, prazoDevolucao: { lt: new Date() } }),
      ...(filtro.busca?.trim() && {
        OR: [
          { equipamento: { nome: { contains: filtro.busca.trim(), mode: 'insensitive' } } },
          ...(filtro.buscarPessoa
            ? [
                { usuario: { nome: { contains: filtro.busca.trim(), mode: 'insensitive' as const } } },
                { usuario: { email: { contains: filtro.busca.trim().toLowerCase() } } },
              ]
            : []),
        ],
      }),
    };
    const [total, itens] = await Promise.all([
      this.prisma.emprestimo.count({ where }),
      this.prisma.emprestimo.findMany({
        where,
        include: DETALHES,
        orderBy: [{ dataRetirada: 'desc' }, { id: 'desc' }], // id desempata: a paginação fica estável
        ...intervalo,
      }),
    ]);
    return { total, itens };
  }
}
