import { Component, effect, input, signal } from '@angular/core';
import { toString as qrParaSvg } from 'qrcode';

// QR code da etiqueta de um equipamento: aponta para a tela de equipamentos já filtrada por ele. Quem escaneia
// com o celular (e tem login) chega direto ao item e pode pegá-lo ou entrar na fila.
@Component({
  selector: 'app-qr-equipamento',
  template: `
    <figure class="etiqueta">
      @if (imagem(); as src) {
        <img [src]="src" width="220" height="220" [alt]="'QR code do equipamento ' + nome()" />
      }
      <figcaption>
        <strong>{{ nome() }}</strong>
        <code>{{ codigo() }}</code>
        <small>{{ link() }}</small>
      </figcaption>
    </figure>
  `,
  styles: `
    .etiqueta {
      display: grid;
      justify-items: center;
      gap: 0.5rem;
      margin: 0;
      text-align: center;
    }
    img {
      background: #fff;
      padding: 0.5rem;
      border-radius: 8px;
      border: 1px solid var(--borda);
    }
    figcaption {
      display: grid;
      gap: 0.2rem;
    }
    code {
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    small {
      color: var(--texto-suave);
      word-break: break-all;
    }
  `,
})
export class QrEquipamento {
  readonly nome = input.required<string>();
  readonly codigo = input.required<string>();
  protected readonly imagem = signal<string | null>(null);

  protected link() {
    return `${location.origin}/equipamentos?busca=${encodeURIComponent(this.codigo())}`;
  }

  constructor() {
    effect(() => {
      const link = `${location.origin}/equipamentos?busca=${encodeURIComponent(this.codigo())}`;
      // SVG (nítido em qualquer tamanho, inclusive impresso), preto sobre branco: o que as câmeras leem melhor
      void qrParaSvg(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) =>
        this.imagem.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
      );
    });
  }
}
