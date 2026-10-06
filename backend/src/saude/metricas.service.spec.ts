import { MetricasService } from './metricas.service';

describe('MetricasService', () => {
  it('conta as requisições por classe de status e soma o tempo de resposta', () => {
    const m = new MetricasService();
    m.registrar(200, 100);
    m.registrar(201, 300);
    m.registrar(404, 50);
    m.registrar(500, 10);
    const texto = m.exposicao({ ativo: true, indicadores: {} });
    expect(texto).toContain('emprestimo_http_requests_total{status="2xx"} 2');
    expect(texto).toContain('emprestimo_http_requests_total{status="4xx"} 1');
    expect(texto).toContain('emprestimo_http_requests_total{status="5xx"} 1');
    expect(texto).toContain('emprestimo_http_request_duration_seconds_count 4');
    expect(texto).toContain('emprestimo_http_request_duration_seconds_sum 0.46');
  });

  it('escreve no formato do Prometheus: HELP, TYPE, valor, e termina com quebra de linha', () => {
    const texto = new MetricasService().exposicao({
      ativo: false,
      indicadores: { emprestimos_atrasados: 3 },
    });
    expect(texto).toContain('# HELP emprestimo_up');
    expect(texto).toContain('# TYPE emprestimo_db_up gauge');
    expect(texto).toContain('emprestimo_db_up 0');
    expect(texto).toContain('emprestimo_emprestimos_atrasados 3');
    expect(texto.endsWith('\n')).toBe(true);
  });
});
