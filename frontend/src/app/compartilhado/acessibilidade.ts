import {
  afterNextRender,
  Component,
  ElementRef,
  HostListener,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AcessibilidadeService,
  Daltonismo,
  TIPOS_DALTONISMO,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../core/acessibilidade.service';
import { Icone } from './icone';

// Barra de acessibilidade no topo de todas as telas: um botão ao lado do outro, cada um com texto e estado
// (aria-pressed) para leitores de tela.
@Component({
  selector: 'app-acessibilidade',
  imports: [Icone],
  templateUrl: './acessibilidade.html',
  styleUrl: './acessibilidade.scss',
})
export class Acessibilidade {
  protected readonly servico = inject(AcessibilidadeService);
  protected readonly ZOOM_MIN = ZOOM_MIN;
  protected readonly ZOOM_MAX = ZOOM_MAX;
  protected readonly tiposDaltonismo = TIPOS_DALTONISMO;

  protected get prefs() {
    return this.servico.prefs();
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly menuAberto = signal(false);
  protected readonly esquerdaDoMenu = signal(0);
  protected readonly rotuloAtual = computed(
    () =>
      TIPOS_DALTONISMO.find((t) => t.valor === this.servico.prefs().daltonismo)?.rotulo ?? 'Nenhum',
  );

  // O menu é "fixed" (a barra rola para o lado em telas estreitas e cortaria um menu absoluto): a posição vem do botão
  protected alternarMenu(gatilho: HTMLElement) {
    if (this.menuAberto()) {
      this.menuAberto.set(false);
      return;
    }
    const larguraDoMenu = 16 * parseFloat(getComputedStyle(document.documentElement).fontSize); // ~16rem
    const esquerda = gatilho.getBoundingClientRect().left;
    this.esquerdaDoMenu.set(Math.max(8, Math.min(esquerda, window.innerWidth - larguraDoMenu - 8)));
    this.menuAberto.set(true);
    // Foco no item marcado (ou no primeiro) assim que o menu é desenhado, para quem usa só o teclado
    afterNextRender(
      () => {
        const itens = this.itensDoMenu();
        (itens.find((i) => i.getAttribute('aria-checked') === 'true') ?? itens[0])?.focus();
      },
      { injector: this.injector },
    );
  }

  protected escolher(valor: Daltonismo, gatilho: HTMLElement) {
    this.servico.alterar('daltonismo', valor);
    this.menuAberto.set(false);
    gatilho.focus();
  }

  protected teclasDoMenu(evento: KeyboardEvent, gatilho: HTMLElement) {
    const itens = this.itensDoMenu();
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    if (evento.key === 'ArrowDown') itens[(atual + 1) % itens.length]?.focus();
    else if (evento.key === 'ArrowUp') itens[(atual - 1 + itens.length) % itens.length]?.focus();
    else if (evento.key === 'Home') itens[0]?.focus();
    else if (evento.key === 'End') itens[itens.length - 1]?.focus();
    else if (evento.key === 'Escape') {
      this.menuAberto.set(false);
      gatilho.focus();
    } else return;
    evento.preventDefault();
  }

  @HostListener('document:click', ['$event'])
  protected fecharAoClicarFora(evento: MouseEvent) {
    if (this.menuAberto() && !this.host.nativeElement.contains(evento.target as Node))
      this.menuAberto.set(false);
  }

  private itensDoMenu(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  }
}
