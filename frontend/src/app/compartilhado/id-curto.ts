import { Component, computed, input } from '@angular/core';

const LIMITE = 5;

// ID compacto: mostra no máximo 5 caracteres e esconde o resto (marcado com "…"). O valor completo continua
// disponível ao passar o mouse e para leitores de tela.
@Component({
  selector: 'app-id-curto',
  template: `<span
    class="id"
    [title]="'ID completo: ' + completo()"
    [attr.aria-label]="'ID ' + completo()"
    >{{ visivel() }}</span
  >`,
  styles: `
    .id {
      display: inline-block;
      padding: 0.1rem 0.4rem;
      border-radius: 6px;
      background: var(--fundo);
      border: 1px solid var(--borda);
      color: var(--texto-suave);
      font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: help;
    }
  `,
})
export class IdCurto {
  readonly valor = input.required<number | string>();

  protected readonly completo = computed(() => String(this.valor()));
  protected readonly visivel = computed(() => {
    const texto = this.completo();
    return texto.length > LIMITE ? `${texto.slice(0, LIMITE)}…` : texto;
  });
}
