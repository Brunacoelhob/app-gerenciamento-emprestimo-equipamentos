import { Component, computed, input } from '@angular/core';

export interface Fatia {
  rotulo: string;
  valor: number;
  cor: string; // variável CSS, ex.: var(--cor-disponivel)
}

// Gráfico de rosca em SVG. A legenda traz o número e o percentual de cada fatia: a cor nunca é a única pista.
@Component({
  selector: 'app-grafico-rosca',
  templateUrl: './grafico-rosca.html',
  styleUrl: './grafico-rosca.scss',
})
export class GraficoRosca {
  readonly fatias = input.required<Fatia[]>();
  readonly rotuloCentro = input('total');

  protected readonly total = computed(() => this.fatias().reduce((t, f) => t + f.valor, 0));

  // Circunferência normalizada em 100: cada fatia é um traço com dasharray "tamanho resto"
  protected readonly segmentos = computed(() => {
    const total = this.total();
    let acumulado = 0;
    return this.fatias().map((f) => {
      const pct = total > 0 ? (f.valor / total) * 100 : 0;
      const folga = this.fatias().filter((x) => x.valor > 0).length > 1 ? 0.8 : 0; // respiro entre fatias
      const visivel = Math.max(0, pct - folga);
      const segmento = { ...f, pct, dasharray: `${visivel} ${100 - visivel}`, deslocamento: 25 - acumulado };
      acumulado += pct;
      return segmento;
    });
  });

  protected readonly resumo = computed(
    () => this.fatias().map((f) => `${f.valor} ${f.rotulo.toLowerCase()}`).join(', ') + `. Total: ${this.total()}.`,
  );
}
