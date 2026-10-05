import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Agregações do painel. As contas por dia e por período são feitas no banco (SQL), não em memória:
// o painel continua rápido mesmo com milhares de empréstimos. Todas as datas são tratadas em UTC.
//
// `usuarioId` restringe tudo aos empréstimos de uma pessoa (painel pessoal); sem ele, vale para todos.
const numero = (valor: bigint | number | null | undefined) =>
  valor === null || valor === undefined ? 0 : Number(valor);

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** O acervo é sempre global: "o que está disponível" não depende de quem pergunta. */
  async acervo() {
    const [ativos, desativados, emprestados] = await Promise.all([
      this.prisma.equipamento.count({ where: { ativo: true } }),
      this.prisma.equipamento.count({ where: { ativo: false } }),
      this.prisma.equipamento.count({ where: { ativo: true, emprestimos: { some: { status: 'ATIVO' } } } }),
    ]);
    return { ativos, desativados, emprestados };
  }

  async emprestimosEmAndamento(usuarioId?: number) {
    const base: Prisma.EmprestimoWhereInput = { status: 'ATIVO', ...(usuarioId && { usuarioId }) };
    const [ativos, atrasados] = await Promise.all([
      this.prisma.emprestimo.count({ where: base }),
      this.prisma.emprestimo.count({ where: { ...base, prazoDevolucao: { lt: new Date() } } }),
    ]);
    return { ativos, atrasados };
  }

  async resumoDoPeriodo(desde: Date, usuarioId?: number) {
    const filtro = usuarioId ? Prisma.sql`AND "usuarioId" = ${usuarioId}` : Prisma.empty;
    const [linha] = await this.prisma.$queryRaw<
      { retiradas: bigint; devolvidos: bigint; pontuais: bigint; tempo_medio: number | null }[]
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE "dataRetirada" >= ${desde}) AS retiradas,
        count(*) FILTER (WHERE status = 'DEVOLVIDO' AND "dataDevolucao" >= ${desde}) AS devolvidos,
        count(*) FILTER (WHERE status = 'DEVOLVIDO' AND "dataDevolucao" >= ${desde}
                           AND "dataDevolucao" <= "prazoDevolucao") AS pontuais,
        avg(extract(epoch FROM ("dataDevolucao" - "dataRetirada")) / 86400)
          FILTER (WHERE status = 'DEVOLVIDO' AND "dataDevolucao" >= ${desde}) AS tempo_medio
      FROM "Emprestimo"
      WHERE true ${filtro}
    `);
    return {
      retiradas: numero(linha?.retiradas),
      devolvidos: numero(linha?.devolvidos),
      pontuais: numero(linha?.pontuais),
      tempoMedioDias:
        linha?.tempo_medio === null || linha?.tempo_medio === undefined ? null : Number(linha.tempo_medio),
    };
  }

  /** Um ponto por dia (inclusive os dias sem movimento), do mais antigo ao mais recente. */
  async serieDiaria(dias: number, usuarioId?: number) {
    const filtro = usuarioId ? Prisma.sql`AND e."usuarioId" = ${usuarioId}` : Prisma.empty;
    const linhas = await this.prisma.$queryRaw<{ dia: string; retiradas: bigint; devolucoes: bigint }[]>(Prisma.sql`
      WITH dias AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'UTC')::date - (${dias}::int - 1),
          (now() AT TIME ZONE 'UTC')::date,
          interval '1 day'
        )::date AS dia
      )
      SELECT
        to_char(d.dia, 'YYYY-MM-DD') AS dia,
        (SELECT count(*) FROM "Emprestimo" e WHERE e."dataRetirada"::date = d.dia ${filtro}) AS retiradas,
        (SELECT count(*) FROM "Emprestimo" e WHERE e."dataDevolucao"::date = d.dia ${filtro}) AS devolucoes
      FROM dias d
      ORDER BY d.dia
    `);
    return linhas.map((l) => ({ dia: l.dia, retiradas: numero(l.retiradas), devolucoes: numero(l.devolucoes) }));
  }

  async equipamentosMaisEmprestados(desde: Date, limite: number, usuarioId?: number) {
    const grupos = await this.prisma.emprestimo.groupBy({
      by: ['equipamentoId'],
      where: { dataRetirada: { gte: desde }, ...(usuarioId && { usuarioId }) },
      _count: { _all: true },
      orderBy: [{ _count: { equipamentoId: 'desc' } }, { equipamentoId: 'asc' }],
      take: limite,
    });
    const nomes = await this.prisma.equipamento.findMany({
      where: { id: { in: grupos.map((g) => g.equipamentoId) } },
      select: { id: true, nome: true },
    });
    return grupos.map((g) => ({
      id: g.equipamentoId,
      nome: nomes.find((n) => n.id === g.equipamentoId)?.nome ?? '—',
      total: g._count._all,
    }));
  }

  async pessoasMaisAtivas(desde: Date, limite: number) {
    const grupos = await this.prisma.emprestimo.groupBy({
      by: ['usuarioId'],
      where: { dataRetirada: { gte: desde } },
      _count: { _all: true },
      orderBy: [{ _count: { usuarioId: 'desc' } }, { usuarioId: 'asc' }],
      take: limite,
    });
    const nomes = await this.prisma.usuario.findMany({
      where: { id: { in: grupos.map((g) => g.usuarioId) } },
      select: { id: true, nome: true },
    });
    return grupos.map((g) => ({
      id: g.usuarioId,
      nome: nomes.find((n) => n.id === g.usuarioId)?.nome ?? '—',
      total: g._count._all,
    }));
  }

  atrasados(limite: number, usuarioId?: number) {
    return this.prisma.emprestimo.findMany({
      where: { status: 'ATIVO', prazoDevolucao: { lt: new Date() }, ...(usuarioId && { usuarioId }) },
      select: {
        id: true,
        prazoDevolucao: true,
        equipamento: { select: { nome: true } },
        usuario: { select: { nome: true } },
      },
      orderBy: { prazoDevolucao: 'asc' }, // os mais antigos (mais atrasados) primeiro
      take: limite,
    });
  }
}
