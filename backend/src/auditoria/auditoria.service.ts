import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { intervalo, montarPagina } from '../common/dto/pagina';
import { PrismaService } from '../prisma/prisma.service';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

// Ações registradas. O texto vai para o banco: não renomeie sem migrar os registros antigos.
export type AcaoAuditoria =
  | 'USUARIO_CRIADO'
  | 'PAPEL_ALTERADO'
  | 'CONTA_DESATIVADA'
  | 'CONTA_REATIVADA'
  | 'CONTA_ANONIMIZADA'
  | 'EQUIPAMENTO_CRIADO'
  | 'EQUIPAMENTO_EDITADO'
  | 'EQUIPAMENTO_DESATIVADO'
  | 'EQUIPAMENTO_REATIVADO'
  | 'DEVOLUCAO_POR_ADMIN'
  | 'SENHA_ALTERADA'
  | 'SENHA_REDEFINIDA_POR_EMAIL'
  | 'EMAIL_ALTERADO'
  | 'SESSAO_REUTILIZADA';

export interface EntradaAuditoria {
  atorId?: number | null;
  acao: AcaoAuditoria;
  entidade: 'usuario' | 'equipamento' | 'emprestimo';
  entidadeId?: number | null;
  detalhes?: Record<string, unknown> | null;
}

// Trilha de auditoria: quem fez o quê e quando, nas ações que mexem em contas, permissões e acervo.
// É "melhor esforço": se gravar falhar, a ação do usuário NÃO é desfeita (o erro vai para o log).
@Injectable()
export class AuditoriaService {
  private readonly log = new Logger('Auditoria');

  constructor(private readonly prisma: PrismaService) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      // O nome fica gravado junto: o registro continua legível mesmo se a conta for anonimizada depois
      const ator = entrada.atorId
        ? await this.prisma.usuario.findUnique({ where: { id: entrada.atorId }, select: { nome: true } })
        : null;
      await this.prisma.registroAuditoria.create({
        data: {
          atorId: entrada.atorId ?? null,
          atorNome: ator?.nome ?? null,
          acao: entrada.acao,
          entidade: entrada.entidade,
          entidadeId: entrada.entidadeId ?? null,
          detalhes: (entrada.detalhes ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (erro) {
      this.log.error(
        `Falha ao registrar ${entrada.acao}: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      );
    }
  }

  async listar(dto: ListarAuditoriaDto) {
    const where: Prisma.RegistroAuditoriaWhereInput = {
      ...(dto.acao && { acao: dto.acao }),
      ...(dto.atorId && { atorId: dto.atorId }),
    };
    const [total, itens] = await Promise.all([
      this.prisma.registroAuditoria.count({ where }),
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        ...intervalo(dto),
      }),
    ]);
    return montarPagina(itens, total, dto);
  }
}
