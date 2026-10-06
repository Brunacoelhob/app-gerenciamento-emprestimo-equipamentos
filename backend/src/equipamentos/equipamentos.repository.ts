import { Injectable } from '@nestjs/common';
import { Equipamento, Prisma, StatusEmprestimo } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FiltroEquipamentos {
  ativo?: boolean;
  emprestado?: boolean;
  busca?: string;
}

// Junta, em cada equipamento, só se existe um empréstimo ATIVO (basta o primeiro): é daí que sai o "emprestado".
const COM_EMPRESTIMO_ATIVO = {
  emprestimos: { where: { status: StatusEmprestimo.ATIVO }, select: { id: true }, take: 1 },
  foto: { select: { atualizadoEm: true } }, // só a versão: os bytes da imagem ficam de fora das listagens
} satisfies Prisma.EquipamentoInclude;

export type EquipamentoComSituacao = Prisma.EquipamentoGetPayload<{ include: typeof COM_EMPRESTIMO_ATIVO }>;

export type ResultadoDesativacao = 'ok' | 'inexistente' | 'emprestado';

@Injectable()
export class EquipamentosRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(dados: { nome: string; descricao?: string }): Promise<EquipamentoComSituacao> {
    return this.prisma.equipamento.create({ data: dados, include: COM_EMPRESTIMO_ATIVO });
  }

  buscarPorId(id: number): Promise<EquipamentoComSituacao | null> {
    return this.prisma.equipamento.findUnique({ where: { id }, include: COM_EMPRESTIMO_ATIVO });
  }

  async listar(filtro: FiltroEquipamentos, intervalo: { skip: number; take: number }) {
    const where: Prisma.EquipamentoWhereInput = {
      ...(filtro.ativo !== undefined && { ativo: filtro.ativo }),
      ...(filtro.busca?.trim() && {
        OR: [
          { nome: { contains: filtro.busca.trim(), mode: 'insensitive' } },
          { descricao: { contains: filtro.busca.trim(), mode: 'insensitive' } },
          { codigo: { equals: filtro.busca.trim().toUpperCase() } }, // o QR code da etiqueta busca por ele
        ],
      }),
      ...(filtro.emprestado !== undefined && {
        emprestimos: filtro.emprestado
          ? { some: { status: StatusEmprestimo.ATIVO } }
          : { none: { status: StatusEmprestimo.ATIVO } },
      }),
    };
    const [total, itens] = await Promise.all([
      this.prisma.equipamento.count({ where }),
      // orderBy fixo: sem ele a paginação do Postgres não é estável (itens repetidos ou perdidos entre páginas)
      this.prisma.equipamento.findMany({ where, include: COM_EMPRESTIMO_ATIVO, orderBy: { id: 'asc' }, ...intervalo }),
    ]);
    return { total, itens };
  }

  salvarFoto(equipamentoId: number, tipo: string, dados: Buffer) {
    return this.prisma.fotoEquipamento.upsert({
      where: { equipamentoId },
      create: { equipamentoId, tipo, dados: new Uint8Array(dados) },
      update: { tipo, dados: new Uint8Array(dados) },
    });
  }

  async removerFoto(equipamentoId: number): Promise<boolean> {
    const { count } = await this.prisma.fotoEquipamento.deleteMany({ where: { equipamentoId } });
    return count > 0;
  }

  buscarFotoPorCodigo(codigo: string) {
    return this.prisma.fotoEquipamento.findFirst({ where: { equipamento: { codigo } } });
  }

  atualizar(
    id: number,
    dados: Partial<Pick<Equipamento, 'nome' | 'descricao' | 'ativo'>>,
  ): Promise<EquipamentoComSituacao> {
    return this.prisma.equipamento.update({ where: { id }, data: dados, include: COM_EMPRESTIMO_ATIVO });
  }

  /**
   * Desativa o equipamento SE não houver empréstimo ativo. Trava a linha (FOR UPDATE) para não correr contra
   * uma retirada simultânea: ou o empréstimo entra primeiro (e a desativação é recusada), ou a desativação
   * entra primeiro (e a retirada é recusada).
   */
  desativarSeLivre(id: number): Promise<ResultadoDesativacao> {
    return this.prisma.$transaction(async (tx) => {
      const linhas = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Equipamento" WHERE "id" = ${id} FOR UPDATE`;
      if (linhas.length === 0) return 'inexistente' as const;

      const ativos = await tx.emprestimo.count({ where: { equipamentoId: id, status: StatusEmprestimo.ATIVO } });
      if (ativos > 0) return 'emprestado' as const;

      await tx.equipamento.update({ where: { id }, data: { ativo: false } });
      return 'ok' as const;
    });
  }
}
