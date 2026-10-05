import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const COM_PESSOA_E_EQUIPAMENTO = {
  id: true,
  prazoDevolucao: true,
  usuario: { select: { id: true, nome: true, email: true, ativo: true } },
  equipamento: { select: { nome: true } },
} satisfies Prisma.EmprestimoSelect;

export type EmprestimoParaAviso = Prisma.EmprestimoGetPayload<{ select: typeof COM_PESSOA_E_EQUIPAMENTO }>;

// Consultas das notificações. A "reivindicação" (reivindicar*) é o que impede aviso duplicado: o UPDATE condicional
// só vence uma vez, então mesmo duas instâncias da API rodando a rotina juntas avisam a pessoa uma única vez.
@Injectable()
export class NotificacoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Em andamento, vencendo nas próximas 24h e ainda sem lembrete. */
  paraLembrar(agora: Date): Promise<EmprestimoParaAviso[]> {
    return this.prisma.emprestimo.findMany({
      where: {
        status: 'ATIVO',
        lembreteEnviadoEm: null,
        prazoDevolucao: { gt: agora, lte: new Date(agora.getTime() + 24 * 3_600_000) },
      },
      select: COM_PESSOA_E_EQUIPAMENTO,
      orderBy: { prazoDevolucao: 'asc' },
    });
  }

  /** Em andamento, já vencidos, e sem aviso de atraso nos últimos `intervaloDias` dias. */
  paraCobrar(agora: Date, intervaloDias: number): Promise<EmprestimoParaAviso[]> {
    const limite = new Date(agora.getTime() - intervaloDias * 86_400_000);
    return this.prisma.emprestimo.findMany({
      where: {
        status: 'ATIVO',
        prazoDevolucao: { lt: agora },
        OR: [{ ultimoAvisoAtrasoEm: null }, { ultimoAvisoAtrasoEm: { lt: limite } }],
      },
      select: COM_PESSOA_E_EQUIPAMENTO,
      orderBy: { prazoDevolucao: 'asc' },
    });
  }

  async reivindicarLembrete(id: number, agora: Date): Promise<boolean> {
    const { count } = await this.prisma.emprestimo.updateMany({
      where: { id, status: 'ATIVO', lembreteEnviadoEm: null },
      data: { lembreteEnviadoEm: agora },
    });
    return count === 1;
  }

  async reivindicarAvisoDeAtraso(id: number, agora: Date, intervaloDias: number): Promise<boolean> {
    const limite = new Date(agora.getTime() - intervaloDias * 86_400_000);
    const { count } = await this.prisma.emprestimo.updateMany({
      where: { id, status: 'ATIVO', OR: [{ ultimoAvisoAtrasoEm: null }, { ultimoAvisoAtrasoEm: { lt: limite } }] },
      data: { ultimoAvisoAtrasoEm: agora },
    });
    return count === 1;
  }

  administradoresAtivos() {
    return this.prisma.usuario.findMany({
      where: { role: 'ADMIN', ativo: true },
      select: { id: true, nome: true, email: true },
    });
  }
}
