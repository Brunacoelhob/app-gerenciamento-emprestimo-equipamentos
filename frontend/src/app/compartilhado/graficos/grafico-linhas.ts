import { Component, computed, input, signal } from '@angular/core';

export interface PontoLinha {
  rotulo: string; // texto do eixo e do tooltip (ex.: "05/10")
  a: number;
  b: number;
}

const L = 640;
const A = 260;
const M = { e: 38, d: 14, t: 14, b: 30 };

// Gráfico de linhas com duas séries (A sólida com área, B tracejada: não depende só da cor), grade, eixos e
// tooltip ao passar o mouse. Desenhado em SVG puro, usando as variáveis de cor do tema. A tabela abaixo dele é a
// alternativa acessível com os mesmos dados.
@Component({
  selector: 'app-grafico-linhas',
  templateUrl: './grafico-linhas.html',
  styleUrl: './grafico-linhas.scss',
})
export class GraficoLinhas {
  readonly pontos = input.required<PontoLinha[]>();
  readonly nomeA = input('Série A');
  readonly nomeB = input('Série B');
  readonly descricao = input('');

  protected readonly L = L;
  protected readonly A = A;
  protected readonly M = M;
  protected readonly foco = signal<number | null>(null);

  protected readonly maximo = computed(() => {
    const maior = Math.max(0, ...this.pontos().flatMap((p) => [p.a, p.b]));
    return Math.max(4, Math.ceil(maior / 4) * 4); // 4 faixas inteiras na grade
  });

  private x(i: number) {
    const n = this.pontos().length;
    return n < 2 ? M.e : M.e + (i * (L - M.e - M.d)) / (n - 1);
  }

  private y(v: number) {
    return M.t + (A - M.t - M.b) * (1 - v / this.maximo());
  }

  protected readonly grade = computed(() =>
    [0, 1, 2, 3, 4].map((k) => {
      const valor = (this.maximo() / 4) * k;
      return { valor, y: this.y(valor) };
    }),
  );

  // Cerca de 6 rótulos no eixo X, sempre incluindo o primeiro e o último dia
  protected readonly rotulosX = computed(() => {
    const pts = this.pontos();
    const passo = Math.max(1, Math.ceil(pts.length / 6));
    return pts
      .map((p, i) => ({ texto: p.rotulo, x: this.x(i), i }))
      .filter((r) => r.i % passo === 0 || r.i === pts.length - 1)
      .filter(
        (r, k, todos) =>
          k === todos.length - 1 || r.i === 0 || todos[todos.length - 1].i - r.i >= passo * 0.6,
      );
  });

  private caminho(campo: 'a' | 'b') {
    return this.pontos()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${this.x(i).toFixed(1)} ${this.y(p[campo]).toFixed(1)}`)
      .join(' ');
  }

  protected readonly linhaA = computed(() => this.caminho('a'));
  protected readonly linhaB = computed(() => this.caminho('b'));
  protected readonly areaA = computed(() => {
    const n = this.pontos().length;
    if (n < 2) return '';
    return `${this.caminho('a')} L${this.x(n - 1).toFixed(1)} ${A - M.b} L${this.x(0).toFixed(1)} ${A - M.b} Z`;
  });

  protected readonly resumo = computed(() => {
    const pts = this.pontos();
    const somaA = pts.reduce((t, p) => t + p.a, 0);
    const somaB = pts.reduce((t, p) => t + p.b, 0);
    return `${this.descricao()} Total no período: ${somaA} ${this.nomeA().toLowerCase()} e ${somaB} ${this.nomeB().toLowerCase()}.`;
  });

  protected readonly tooltip = computed(() => {
    const i = this.foco();
    const p = i === null ? null : this.pontos()[i];
    if (i === null || !p) return null;
    const x = this.x(i);
    const largura = 128;
    return {
      x,
      yA: this.y(p.a),
      yB: this.y(p.b),
      caixaX: x > L / 2 ? x - largura - 10 : x + 10,
      largura,
      ponto: p,
    };
  });

  protected mover(evento: MouseEvent) {
    const n = this.pontos().length;
    if (n === 0) return;
    const svg = evento.currentTarget as SVGSVGElement;
    const caixa = svg.getBoundingClientRect();
    const xSvg = ((evento.clientX - caixa.left) * L) / caixa.width;
    const indice = n < 2 ? 0 : Math.round(((xSvg - M.e) * (n - 1)) / (L - M.e - M.d));
    this.foco.set(Math.min(n - 1, Math.max(0, indice)));
  }
}
