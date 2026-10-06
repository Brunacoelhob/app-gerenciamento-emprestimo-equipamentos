import { Component } from '@angular/core';
import { Logo } from './logo';

// Rodapé fixo, igual em todas as telas (inclusive o login).
@Component({
  selector: 'app-rodape',
  imports: [Logo],
  template: `
    <footer class="rodape">
      <app-logo [tamanho]="20" />
      <span><strong>Equipment loan</strong> · Gestão de empréstimo de equipamentos</span>
      <span class="direitos">© {{ ano }} Equipment loan. Todos os direitos reservados.</span>
    </footer>
  `,
  styleUrl: './rodape.scss',
})
export class Rodape {
  protected readonly ano = new Date().getFullYear();
}
