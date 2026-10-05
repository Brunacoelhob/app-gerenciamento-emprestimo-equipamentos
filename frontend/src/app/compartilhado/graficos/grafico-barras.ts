import { Component, computed, input } from '@angular/core';

export interface ItemBarra {
  nome: string;
  total: number;
}

// Ranking em barras horizontais. É uma lista (<ol>) de verdade: leitor de tela lê "nome, valor" em ordem.
@Component({
  selector: 'app-grafico-barras',
  template: `
    @if (itens().length === 0) {
      <p class="vazio">{{ vazio() }}</p>
    } @else {
      <ol>
        @for (item of linhas(); track item.nome) {
          <li>
            <span class="nome" [title]="item.nome">{{ item.nome }}</span>
            <span class="trilho" aria-hidden="true">
              <span class="barra" [style.width.%]="item.largura" [style.background]="cor()"></span>
            </span>
            <strong class="valor">{{ item.total }}</strong>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: minmax(7rem, 11rem) 1fr 2rem;
      align-items: center;
      gap: 0.75rem;
      padding: 0.35rem 0;
    }
    .nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.9rem;
    }
    .trilho {
      height: 0.8rem;
      border-radius: 999px;
      background: var(--borda);
      overflow: hidden;
    }
    .barra {
      display: block;
      height: 100%;
      min-width: 4px;
      border-radius: 999px;
      transition: width 0.4s ease;
    }
    .valor {
      text-align: right;
    }
    .vazio {
      margin: 0;
      padding: 1rem 0;
      text-align: center;
      color: var(--texto-suave);
    }
  `,
})
export class GraficoBarras {
  readonly itens = input.required<ItemBarra[]>();
  readonly cor = input('var(--grafico-1)');
  readonly vazio = input('Sem dados no período.');

  protected readonly linhas = computed(() => {
    const maior = Math.max(1, ...this.itens().map((i) => i.total));
    return this.itens().map((i) => ({ ...i, largura: (i.total / maior) * 100 }));
  });
}
