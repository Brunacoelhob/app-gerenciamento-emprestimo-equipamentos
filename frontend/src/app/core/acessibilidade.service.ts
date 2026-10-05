import { effect, Injectable, signal } from '@angular/core';

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
  /** Painel de opções aberto? Compartilhado: o botão flutuante e o item do menu lateral abrem o mesmo painel. */
  readonly painelAberto = signal(false);
  private vlibrasIniciado = false;

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
      this.vlibras(p.vlibras);
      this.salvar(p);
    });
  }

  alterar<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
    this.prefs.update((p) => ({ ...p, [chave]: valor }));
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
          vlibras: salvo.vlibras === true,
        };
      }
    } catch {
      /* armazenamento indisponível ou conteúdo inválido: usa o padrão */
    }
    return { ...PADRAO };
  }

  private salvar(p: Preferencias) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {
      /* ignora */
    }
  }

  // VLibras (tradução para Libras do governo federal): o script só é baixado quando a pessoa liga o recurso.
  private vlibras(ligado: boolean) {
    const raiz = document.getElementById('vlibras-raiz');
    if (!ligado) {
      if (raiz) raiz.style.display = 'none';
      return;
    }
    if (raiz) {
      raiz.style.display = '';
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
    };
    script.onerror = () => {
      // Sem internet ou bloqueado: remove o resto e permite tentar de novo
      div.remove();
      this.vlibrasIniciado = false;
    };
    document.body.appendChild(script);
  }
}
