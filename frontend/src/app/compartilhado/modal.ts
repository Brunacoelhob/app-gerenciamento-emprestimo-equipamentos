import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { Icone } from './icone';

let proximoId = 0;

// Janela modal sobre o <dialog> nativo: o navegador cuida do foco preso dentro dela, do Esc, de deixar o resto da
// página inerte e de devolver o foco ao botão que abriu. Fecha também ao clicar no fundo escurecido.
@Component({
  selector: 'app-modal',
  imports: [Icone],
  template: `
    <dialog #janela [attr.aria-labelledby]="idTitulo" (close)="fechar.emit()" (click)="cliqueNoFundo($event)">
      <div class="corpo">
        <header>
          <h2 [id]="idTitulo">{{ titulo() }}</h2>
          <button class="x" type="button" aria-label="Fechar" (click)="janela.close()">
            <app-icone nome="fechar" />
          </button>
        </header>
        <div class="conteudo"><ng-content /></div>
        <footer>
          <ng-content select="[acoes]" />
          <button class="botao" type="button" (click)="janela.close()">{{ rotuloFechar() }}</button>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './modal.scss',
})
export class Modal {
  readonly titulo = input.required<string>();
  readonly aberto = input(false);
  /** Texto do botão que só fecha a janela (Entendi para avisos, Cancelar para confirmações). */
  readonly rotuloFechar = input('Entendi');
  readonly fechar = output<void>();

  protected readonly idTitulo = `modal-titulo-${++proximoId}`;
  private readonly janela = viewChild.required<ElementRef<HTMLDialogElement>>('janela');

  constructor() {
    effect(() => {
      const dialogo = this.janela().nativeElement;
      if (this.aberto() && !dialogo.open) dialogo.showModal();
      if (!this.aberto() && dialogo.open) dialogo.close();
    });
  }

  protected cliqueNoFundo(evento: MouseEvent) {
    // O clique cai no próprio <dialog> só quando é no fundo (o conteúdo fica dentro de .corpo)
    if (evento.target === this.janela().nativeElement) this.janela().nativeElement.close();
  }
}
