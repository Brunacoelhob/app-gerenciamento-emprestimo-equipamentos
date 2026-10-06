import { Component, inject, signal } from '@angular/core';
import { ConsentimentoService } from '../core/consentimento.service';

// Aviso de cookies: aparece a cada carregamento da página, com três caminhos (aceitar, recusar ou configurar).
// Não bloqueia o resto da tela; fica acima do rodapé.
@Component({
  selector: 'app-aviso-cookies',
  template: `
    @if (!consentimento.decidido()) {
      <section
        class="aviso"
        role="dialog"
        aria-labelledby="cookies-titulo"
        aria-describedby="cookies-texto"
      >
        <h2 id="cookies-titulo">Cookies e privacidade</h2>
        <p id="cookies-texto">
          Usamos cookies necessários para manter a sua sessão com segurança. Com a sua permissão,
          também lembramos as suas preferências de acessibilidade e carregamos o tradutor de Libras
          (VLibras), um serviço do governo federal.
        </p>

        @if (configurando()) {
          <fieldset class="opcoes">
            <legend class="so-leitor">Escolha os cookies</legend>
            <label class="opcao">
              <input type="checkbox" checked disabled />
              <span><strong>Necessários</strong> Sessão e segurança. Sempre ativos.</span>
            </label>
            <label class="opcao">
              <input
                type="checkbox"
                [checked]="funcionais()"
                (change)="funcionais.set(!funcionais())"
              />
              <span
                ><strong>Funcionais</strong> Lembrar tema, contraste e tamanho do texto neste
                aparelho.</span
              >
            </label>
            <label class="opcao">
              <input
                type="checkbox"
                [checked]="terceiros()"
                (change)="terceiros.set(!terceiros())"
              />
              <span
                ><strong>Serviços de terceiros</strong> Tradutor de Libras (VLibras), que carrega do
                site do governo.</span
              >
            </label>
          </fieldset>
        }

        <div class="acoes">
          @if (configurando()) {
            <button
              type="button"
              class="botao"
              (click)="consentimento.salvar(funcionais(), terceiros())"
            >
              Salvar escolhas
            </button>
          } @else {
            <button type="button" class="botao" (click)="consentimento.aceitarTodos()">
              Aceitar
            </button>
            <button type="button" class="botao secundario" (click)="consentimento.recusar()">
              Recusar
            </button>
            <button type="button" class="botao secundario" (click)="configurando.set(true)">
              Configurar
            </button>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './aviso-cookies.scss',
})
export class AvisoCookies {
  protected readonly consentimento = inject(ConsentimentoService);
  protected readonly configurando = signal(false);
  protected readonly funcionais = signal(true);
  protected readonly terceiros = signal(true);
}
