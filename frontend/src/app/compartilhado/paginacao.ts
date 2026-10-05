import { Component, input, output } from '@angular/core';
import { MetaPagina } from '../core/modelos';

@Component({
  selector: 'app-paginacao',
  template: `
    @if (meta().totalPaginas > 1) {
      <nav class="paginacao" aria-label="Paginação">
        <button class="botao secundario" type="button" [disabled]="meta().pagina <= 1" (click)="mudar.emit(meta().pagina - 1)">
          Anterior
        </button>
        <span>Página {{ meta().pagina }} de {{ meta().totalPaginas }} · {{ meta().total }} itens</span>
        <button
          class="botao secundario"
          type="button"
          [disabled]="meta().pagina >= meta().totalPaginas"
          (click)="mudar.emit(meta().pagina + 1)"
        >
          Próxima
        </button>
      </nav>
    }
  `,
  styles: `
    .paginacao {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-top: 1rem;
      color: var(--texto-suave);
      font-size: 0.9rem;
    }
  `,
})
export class Paginacao {
  readonly meta = input.required<MetaPagina>();
  readonly mudar = output<number>();
}
