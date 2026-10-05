import { Injectable } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { DashboardRepository } from './dashboard.repository';
import { DashboardRespostaDto } from './dto/dashboard-resposta.dto';

const DIA_MS = 86_400_000;
const TOP = 5;

// Painel de métricas. ADMIN enxerga o sistema inteiro; os demais, só os próprios empréstimos
// (o estado do acervo, como "o que está disponível", é o mesmo para todos).
@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async resumo(usuario: UsuarioAutenticado, dias: number, agora = new Date()): Promise<DashboardRespostaDto> {
    const geral = usuario.role === Role.ADMIN;
    const usuarioId = geral ? undefined : usuario.id;

    // O período vai do início (UTC) do primeiro dia da série até agora: os totais batem com o gráfico
    const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
    const desde = new Date(hoje - (dias - 1) * DIA_MS);

    const [acervo, andamento, periodo, serie, equipamentos, pessoas, atrasados] = await Promise.all([
      this.repo.acervo(),
      this.repo.emprestimosEmAndamento(usuarioId),
      this.repo.resumoDoPeriodo(desde, usuarioId),
      this.repo.serieDiaria(dias, usuarioId),
      this.repo.equipamentosMaisEmprestados(desde, TOP, usuarioId),
      geral ? this.repo.pessoasMaisAtivas(desde, TOP) : Promise.resolve([]),
      this.repo.atrasados(TOP, usuarioId),
    ]);

    return {
      escopo: geral ? 'geral' : 'pessoal',
      dias,
      kpis: {
        equipamentosAtivos: acervo.ativos,
        disponiveis: acervo.ativos - acervo.emprestados,
        emprestados: acervo.emprestados,
        desativados: acervo.desativados,
        emprestimosAtivos: andamento.ativos,
        atrasados: andamento.atrasados,
        retiradasNoPeriodo: periodo.retiradas,
        devolvidosNoPeriodo: periodo.devolvidos,
        pontualidade: periodo.devolvidos > 0 ? Math.round((periodo.pontuais / periodo.devolvidos) * 100) : null,
        tempoMedioDias: periodo.tempoMedioDias === null ? null : Math.round(periodo.tempoMedioDias * 10) / 10,
      },
      serie,
      maisEmprestados: equipamentos,
      pessoasMaisAtivas: pessoas,
      atrasados: atrasados.map((a) => ({
        id: a.id,
        equipamento: a.equipamento.nome,
        pessoa: a.usuario.nome,
        prazoDevolucao: a.prazoDevolucao,
        diasDeAtraso: Math.max(1, Math.floor((agora.getTime() - a.prazoDevolucao.getTime()) / DIA_MS)),
      })),
      geradoEm: agora,
    };
  }
}
