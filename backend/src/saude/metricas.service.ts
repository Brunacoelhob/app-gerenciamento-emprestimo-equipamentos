import { Injectable } from '@nestjs/common';

const INICIO = Date.now();

/** Contadores simples das requisições HTTP, guardados em memória (zeram quando a API reinicia, como todo contador). */
@Injectable()
export class MetricasService {
  private readonly porClasse = new Map<string, number>();
  private somaSegundos = 0;
  private total = 0;

  registrar(status: number, duracaoMs: number): void {
    const classe = `${Math.floor(status / 100)}xx`;
    this.porClasse.set(classe, (this.porClasse.get(classe) ?? 0) + 1);
    this.somaSegundos += duracaoMs / 1000;
    this.total += 1;
  }

  /** Texto no formato de exposição do Prometheus (lido também por Grafana Agent, Datadog, etc.). */
  exposicao(banco: { ativo: boolean; indicadores: Record<string, number> }): string {
    const linhas: string[] = [];
    const metrica = (nome: string, ajuda: string, tipo: 'gauge' | 'counter', valores: [string, number][]) => {
      linhas.push(`# HELP ${nome} ${ajuda}`, `# TYPE ${nome} ${tipo}`);
      for (const [rotulo, valor] of valores) linhas.push(`${nome}${rotulo} ${valor}`);
    };

    metrica('emprestimo_up', 'A API respondeu a esta leitura.', 'gauge', [['', 1]]);
    metrica('emprestimo_uptime_seconds', 'Segundos desde que a API iniciou.', 'counter', [
      ['', Math.round((Date.now() - INICIO) / 1000)],
    ]);
    metrica('emprestimo_db_up', 'O banco respondeu (1) ou não (0).', 'gauge', [['', banco.ativo ? 1 : 0]]);
    metrica(
      'emprestimo_http_requests_total',
      'Requisições HTTP atendidas, por classe de status.',
      'counter',
      [...this.porClasse.entries()].sort().map(([c, v]): [string, number] => [`{status="${c}"}`, v]),
    );
    metrica('emprestimo_http_request_duration_seconds_sum', 'Soma do tempo de resposta.', 'counter', [
      ['', Number(this.somaSegundos.toFixed(3))],
    ]);
    metrica('emprestimo_http_request_duration_seconds_count', 'Quantidade de respostas medidas.', 'counter', [
      ['', this.total],
    ]);
    for (const [nome, valor] of Object.entries(banco.indicadores)) {
      metrica(`emprestimo_${nome}`, `Indicador de negócio: ${nome.replace(/_/g, ' ')}.`, 'gauge', [['', valor]]);
    }
    return linhas.join('\n') + '\n';
  }
}
