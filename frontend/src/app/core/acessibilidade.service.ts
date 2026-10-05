import { computed, effect, Injectable, signal } from '@angular/core';

export type Tema = 'auto' | 'claro' | 'escuro';

export interface Preferencias {
  tema: Tema;
  zoom: number; // multiplicador do tamanho do texto
  contraste: boolean;
  dislexia: boolean;
  daltonismo: boolean;
  semAnimacao: boolean;
  vlibras: boolean;
}

const PADRAO: Preferencias = {
  tema: 'auto',
  zoom: 1,
  contraste: false,
  dislexia: false,
  daltonismo: false,
  semAnimacao: false,
  vlibras: false,
};

export const ZOOM_MIN = 0.85;
export const ZOOM_MAX = 1.6;
const PASSO = 0.15;
const CHAVE = 'emprestimos.acessibilidade';
// Muda quando um padrão muda: preferências salvas numa versão antiga não carregam o valor antigo do que mudou
const VERSAO = 3;
const SCRIPT_VLIBRAS = 'https://vlibras.gov.br/app/vlibras-plugin.js';
const APP_VLIBRAS = 'https://vlibras.gov.br/app';

declare global {
  interface Window {
    VLibras?: { Widget: new (url: string) => unknown };
  }
}

// Preferências de acessibilidade: ficam salvas neste navegador e valem para todas as telas (inclusive o login).
// O efeito reflete cada uma como atributo no <html>; os estilos globais (styles.scss) reagem a esses atributos.
@Injectable({ providedIn: 'root' })
export class AcessibilidadeService {
  readonly prefs = signal<Preferencias>(this.carregar());
  /** Está no modo escuro agora? (no tema "auto", segue o sistema) */
  readonly escuro = computed(() => {
    const tema = this.prefs().tema;
    return tema === 'escuro' || (tema === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  });
  private vlibrasIniciado = false;
  private vlibrasAnterior = false;

  constructor() {
    effect(() => {
      const p = this.prefs();
      const html = document.documentElement;
      this.atributo(html, 'data-tema', p.tema === 'auto' ? null : p.tema);
      this.atributo(html, 'data-contraste', p.contraste ? 'alto' : null);
      this.atributo(html, 'data-dislexia', p.dislexia ? 'on' : null);
      this.atributo(html, 'data-daltonismo', p.daltonismo ? 'on' : null);
      this.atributo(html, 'data-animacao', p.semAnimacao ? 'reduzida' : null);
      html.style.setProperty('--zoom', String(p.zoom));
      // O VLibras só reage quando a pessoa liga ou desliga: mudar outra opção não pode reabrir o painel que ela fechou
      if (p.vlibras !== this.vlibrasAnterior) {
        this.vlibrasAnterior = p.vlibras;
        this.vlibras(p.vlibras);
      }
      this.salvar(p);
    });
  }

  alterar<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
    this.prefs.update((p) => ({ ...p, [chave]: valor }));
  }

  alternarTema() {
    this.alterar('tema', this.escuro() ? 'claro' : 'escuro');
  }

  // Botão "Libras" da barra: se está ligado mas a pessoa fechou o painel do VLibras, reabre; senão liga/desliga.
  alternarLibras() {
    if (this.prefs().vlibras && !this.painelVLibrasAberto()) this.abrirVLibras();
    else this.alterar('vlibras', !this.prefs().vlibras);
  }

  aumentar() {
    this.alterar('zoom', this.limitar(this.prefs().zoom + PASSO));
  }

  diminuir() {
    this.alterar('zoom', this.limitar(this.prefs().zoom - PASSO));
  }

  restaurar() {
    this.prefs.set({ ...PADRAO });
  }

  private limitar(zoom: number) {
    return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 100) / 100;
  }

  private atributo(el: HTMLElement, nome: string, valor: string | null) {
    if (valor === null) el.removeAttribute(nome);
    else el.setAttribute(nome, valor);
  }

  private carregar(): Preferencias {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Partial<Preferencias> | null;
      if (salvo && typeof salvo === 'object') {
        return {
          tema: ['auto', 'claro', 'escuro'].includes(salvo.tema as string) ? (salvo.tema as Tema) : PADRAO.tema,
          zoom: typeof salvo.zoom === 'number' ? this.limitar(salvo.zoom) : PADRAO.zoom,
          contraste: salvo.contraste === true,
          dislexia: salvo.dislexia === true,
          daltonismo: salvo.daltonismo === true,
          semAnimacao: salvo.semAnimacao === true,
          // O VLibras agora abre pelo botão da barra: valores salvos em versões antigas não valem como escolha
          vlibras: (salvo as { versao?: number }).versao === VERSAO ? salvo.vlibras === true : PADRAO.vlibras,
        };
      }
    } catch {
      /* armazenamento indisponível ou conteúdo inválido: usa o padrão */
    }
    return { ...PADRAO };
  }

  private salvar(p: Preferencias) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...p, versao: VERSAO }));
    } catch {
      /* ignora */
    }
  }

  // O plugin cria a interface dele em Shadow DOM, em <div>s soltos no <body> (fora do contêiner que criamos aqui):
  // um com o ícone de abrir e outro com o painel de tradução.
  private hospedeirosVLibras(): HTMLElement[] {
    return [...document.body.children].filter((e): e is HTMLElement => e instanceof HTMLElement && !!e.shadowRoot);
  }

  private hospedeiroVLibras(): HTMLElement | null {
    return this.hospedeirosVLibras().find((e) => e.shadowRoot?.querySelector('button')) ?? null;
  }

  // O ícone azul padrão do plugin fica escondido: quem abre o painel é o botão "Libras" da barra de acessibilidade.
  private esconderIconeVLibras(hospedeiro: HTMLElement) {
    const botao = hospedeiro.shadowRoot?.querySelector('button');
    const raiz = hospedeiro.shadowRoot;
    if (!botao?.parentElement || !raiz || raiz.querySelector('style[data-barra]')) return;
    botao.parentElement.setAttribute('data-icone-vlibras', '');
    const estilo = document.createElement('style');
    estilo.setAttribute('data-barra', '');
    estilo.textContent = '[data-icone-vlibras] { display: none !important; }';
    raiz.appendChild(estilo);
  }

  private painelVLibrasAberto(): boolean {
    return this.hospedeirosVLibras().some((h) => {
      const painel = h.shadowRoot?.querySelector('div.fixed');
      return !!painel && painel.getBoundingClientRect().width > 0;
    });
  }

  private abrirVLibras(tentativas = 0) {
    const hospedeiro = this.hospedeiroVLibras();
    const botao = hospedeiro?.shadowRoot?.querySelector('button');
    if (hospedeiro && botao) {
      this.esconderIconeVLibras(hospedeiro);
      if (!this.painelVLibrasAberto()) botao.click(); // click() funciona mesmo com o ícone escondido
      return;
    }
    // O plugin monta a interface alguns instantes depois de o script carregar
    if (tentativas < 40) setTimeout(() => this.abrirVLibras(tentativas + 1), 250);
  }

  // VLibras (tradução para Libras do governo federal): o script só é baixado quando a pessoa liga o recurso.
  private vlibras(ligado: boolean) {
    const raiz = document.getElementById('vlibras-raiz');
    const mostrar = (visivel: boolean) => {
      for (const e of [raiz, ...this.hospedeirosVLibras()]) if (e) e.style.display = visivel ? '' : 'none';
    };
    if (!ligado) {
      mostrar(false);
      return;
    }
    if (raiz) {
      mostrar(true);
      this.abrirVLibras();
      return;
    }
    if (this.vlibrasIniciado) return;
    this.vlibrasIniciado = true;

    const div = document.createElement('div');
    div.id = 'vlibras-raiz';
    div.setAttribute('vw', '');
    div.className = 'enabled';
    div.innerHTML =
      '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
    document.body.appendChild(div);

    const script = document.createElement('script');
    script.src = SCRIPT_VLIBRAS;
    script.onload = () => {
      if (window.VLibras) new window.VLibras.Widget(APP_VLIBRAS);
      this.abrirVLibras();
    };
    script.onerror = () => {
      // Sem internet ou bloqueado: remove o resto, desliga a opção e permite tentar de novo
      div.remove();
      this.vlibrasIniciado = false;
      this.vlibrasAnterior = false;
      this.alterar('vlibras', false);
    };
    document.body.appendChild(script);
  }
}
