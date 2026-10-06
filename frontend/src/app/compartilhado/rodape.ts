import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from './logo';

// Rodapé fixo, igual em todas as telas (inclusive o login).
@Component({
  selector: 'app-rodape',
  imports: [Logo, RouterLink],
  template: `
    <footer class="rodape">
      <app-logo [tamanho]="20" />
      <span><strong>Equipment loan</strong> · Gestão de empréstimo de equipamentos</span>
      <a class="link-privacidade" routerLink="/privacidade">Privacidade</a>
      <span class="direitos">© {{ ano }} Equipment loan. Todos os direitos reservados.</span>
    </footer>
  `,
  styleUrl: './rodape.scss',
})
export class Rodape {
  protected readonly ano = new Date().getFullYear();
}
