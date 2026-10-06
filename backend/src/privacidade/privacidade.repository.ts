import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const NOME_ANONIMIZADO = 'Usuário removido';

@Injectable()
export class PrivacidadeRepository {
  constructor(private readonly prisma: PrismaService) {}

  emprestimosDaPessoa(usuarioId: number) {
    return this.prisma.emprestimo.findMany({
      where: { usuarioId },
      select: {
        id: true,
        status: true,
        dataRetirada: true,
        prazoDevolucao: true,
        dataDevolucao: true,
        equipamento: { select: { nome: true } },
      },
      orderBy: { dataRetirada: 'desc' },
    });
  }

  acoesDaPessoa(usuarioId: number) {
    return this.prisma.registroAuditoria.findMany({
      where: { atorId: usuarioId },
      select: { criadoEm: true, acao: true, entidade: true, entidadeId: true },
      orderBy: { criadoEm: 'desc' },
      take: 1000,
    });
  }

  contarEmprestimosEmAndamento(usuarioId: number): Promise<number> {
    return this.prisma.emprestimo.count({ where: { usuarioId, status: 'ATIVO' } });
  }

  /**
   * Anonimiza a conta numa transação: some tudo que identifica a pessoa, mas a linha continua existindo para o
   * histórico de empréstimos do acervo não quebrar (ele passa a mostrar "Usuário removido").
   */
  anonimizar(id: number, dados: { email: string; senhaHash: string }): Promise<unknown> {
    return this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id },
        data: {
          nome: NOME_ANONIMIZADO,
          email: dados.email,
          senhaHash: dados.senhaHash, // hash de uma senha aleatória que ninguém conhece: a conta não entra mais
          ativo: false,
          cpf: null,
          telefone: null,
          cep: null,
          logradouro: null,
          numero: null,
          complemento: null,
          bairro: null,
          cidade: null,
          uf: null,
          avatar: null,
        },
      }),
      this.prisma.refreshToken.deleteMany({ where: { usuarioId: id } }),
      this.prisma.reserva.updateMany({ where: { usuarioId: id, status: 'AGUARDANDO' }, data: { status: 'CANCELADA' } }),
      this.prisma.recuperacaoSenha.deleteMany({ where: { usuarioId: id } }),
      // A trilha de auditoria guardava o nome e o e-mail: troca pelo nome anonimizado e tira o e-mail dos detalhes
      this.prisma.registroAuditoria.updateMany({ where: { atorId: id }, data: { atorNome: NOME_ANONIMIZADO } }),
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE "RegistroAuditoria" SET "detalhes" = "detalhes" - 'email'
        WHERE "entidade" = 'usuario' AND "entidadeId" = ${id} AND "detalhes" ? 'email'
      `),
    ]);
  }
}
