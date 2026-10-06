import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icone } from './icone';

export interface ItemDoMenu<T extends string = string> {
  valor: T;
  rotulo: string;
  detalhe?: string;
}

// Botão que abre um menu de opções (usado para escolher o formato de um relatório). Acessível: abre e fecha com o
// teclado (Enter, setas, Esc), devolve o foco ao botão e fecha ao clicar fora. O menu é "fixed" para não ser cortado
// por áreas com rolagem.
@Component({
  selector: 'app-menu-exportar',
  imports: [Icone],
  template: `
    <button
      #gatilho
      type="button"
      class="botao secundario"
      aria-haspopup="menu"
      [attr.aria-expanded]="aberto()"
      [disabled]="desabilitado()"
      (click)="alternar(gatilho)"
    >
      <app-icone nome="baixar" />
      {{ rotulo() }}
      <span class="seta" aria-hidden="true">▾</span>
    </button>

    @if (aberto()) {
      <div
        class="menu"
        role="menu"
        [attr.aria-label]="rotulo()"
        [style.left.px]="esquerda()"
        [style.top.px]="topo()"
        (keydown)="teclas($event, gatilho)"
      >
        @for (item of itens(); track item.valor) {
          <button type="button" role="menuitem" (click)="escolher(item.valor, gatilho)">
            <strong>{{ item.rotulo }}</strong>
            @if (item.detalhe) {
              <small>{{ item.detalhe }}</small>
            }
          </button>
        }
      </div>
    }
  `,
  styleUrl: './menu-exportar.scss',
})
export class MenuExportar {
  readonly rotulo = input('Exportar');
  readonly itens = input.required<ItemDoMenu[]>();
  readonly desabilitado = input(false);
  readonly escolhido = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly aberto = signal(false);
  protected readonly esquerda = signal(0);
  protected readonly topo = signal(0);

  protected alternar(gatilho: HTMLElement) {
    if (this.aberto()) {
      this.aberto.set(false);
      return;
    }
    const caixa = gatilho.getBoundingClientRect();
    const larguraDoMenu = 15 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    this.esquerda.set(Math.max(8, Math.min(caixa.left, window.innerWidth - larguraDoMenu - 8)));
    this.topo.set(caixa.bottom + 4);
    this.aberto.set(true);
    afterNextRender(() => this.itensDoMenu()[0]?.focus(), { injector: this.injector });
  }

  protected escolher(valor: string, gatilho: HTMLElement) {
    this.aberto.set(false);
    gatilho.focus();
    this.escolhido.emit(valor);
  }

  protected teclas(evento: KeyboardEvent, gatilho: HTMLElement) {
    const itens = this.itensDoMenu();
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    if (evento.key === 'ArrowDown') itens[(atual + 1) % itens.length]?.focus();
    else if (evento.key === 'ArrowUp') itens[(atual - 1 + itens.length) % itens.length]?.focus();
    else if (evento.key === 'Escape') {
      this.aberto.set(false);
      gatilho.focus();
    } else return;
    evento.preventDefault();
  }

  @HostListener('document:click', ['$event'])
  protected fora(evento: MouseEvent) {
    if (this.aberto() && !this.host.nativeElement.contains(evento.target as Node))
      this.aberto.set(false);
  }

  private itensDoMenu(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }
}
