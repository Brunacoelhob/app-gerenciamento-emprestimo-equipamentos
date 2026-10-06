import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ConsentimentoService } from './consentimento.service';

export type Tema = 'auto' | 'claro' | 'escuro';
export type Daltonismo = 'nenhum' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'acromatopsia';

// O que cada tipo significa, para o seletor da barra de acessibilidade
export const TIPOS_DALTONISMO: { valor: Daltonismo; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'Nenhum' },
  { valor: 'protanopia', rotulo: 'Protanopia (sem vermelho)' },
  { valor: 'deuteranopia', rotulo: 'Deuteranopia (sem verde)' },
  { valor: 'tritanopia', rotulo: 'Tritanopia (sem azul)' },
  { valor: 'acromatopsia', rotulo: 'Acromatopsia (sem cores)' },
];

export interface Preferencias {
  tema: Tema;
  zoom: number; // multiplicador do tamanho do texto
  contraste: boolean;
  dislexia: boolean;
  daltonismo: Daltonismo;
  semAnimacao: boolean;
}

const PADRAO: Preferencias = {
  tema: 'auto',
  zoom: 1,
  contraste: false,
  dislexia: false,
  daltonismo: 'nenhum',
  semAnimacao: false,
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
  /** Está no modo escuro agora? (no tema "auto", segue o sistema) */
  readonly escuro = computed(() => {
    const tema = this.prefs().tema;
    return (
      tema === 'escuro' ||
      (tema === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
    );
  });

  private readonly consentimento = inject(ConsentimentoService);

  constructor() {
    effect(() => {
      const p = this.prefs();
      const html = document.documentElement;
      this.atributo(html, 'data-tema', p.tema === 'auto' ? null : p.tema);
      this.atributo(html, 'data-contraste', p.contraste ? 'alto' : null);
      this.atributo(html, 'data-dislexia', p.dislexia ? 'on' : null);
      this.atributo(html, 'data-daltonismo', p.daltonismo === 'nenhum' ? null : p.daltonismo);
      this.atributo(html, 'data-animacao', p.semAnimacao ? 'reduzida' : null);
      html.style.setProperty('--zoom', String(p.zoom));
      // Só guarda no aparelho com a permissão da pessoa (cookies funcionais)
      if (this.consentimento.funcionais()) this.salvar(p);
      else this.esquecer();
    });
    // O VLibras é um serviço externo: só carrega com a permissão da pessoa
    effect(() => {
      if (this.consentimento.terceiros()) this.iniciarVLibras();
    });
  }

  alterar<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
    this.prefs.update((p) => ({ ...p, [chave]: valor }));
  }

  alternarTema() {
    this.alterar('tema', this.escuro() ? 'claro' : 'escuro');
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
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Record<
        string,
        unknown
      > | null;
      if (salvo && typeof salvo === 'object') {
        return {
          tema: ['auto', 'claro', 'escuro'].includes(salvo['tema'] as string)
            ? (salvo['tema'] as Tema)
            : PADRAO.tema,
          zoom: typeof salvo['zoom'] === 'number' ? this.limitar(salvo['zoom']) : PADRAO.zoom,
          contraste: salvo['contraste'] === true,
          dislexia: salvo['dislexia'] === true,
          daltonismo: this.lerDaltonismo(salvo['daltonismo']),
          semAnimacao: salvo['semAnimacao'] === true,
        };
      }
    } catch {
      /* armazenamento indisponível ou conteúdo inválido: usa o padrão */
    }
    return { ...PADRAO };
  }

  // Versões antigas guardavam "ligado/desligado": quem tinha ligado fica com a paleta para vermelho-verde, a mais comum
  private lerDaltonismo(valor: unknown): Daltonismo {
    if (valor === true) return 'deuteranopia';
    return TIPOS_DALTONISMO.some((t) => t.valor === valor) ? (valor as Daltonismo) : 'nenhum';
  }

  private esquecer() {
    if (!this.consentimento.decidido()) return; // antes da escolha, o que já estava guardado continua valendo
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* ignora */
    }
  }

  private salvar(p: Preferencias) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {
      /* ignora */
    }
  }

  // VLibras (tradução para Libras do governo federal): como nos sites do governo, o ícone fica sempre no canto
  // direito da tela e a pessoa abre quando precisa. O script é carregado de vlibras.gov.br (exige internet; sem ela
  // o ícone simplesmente não aparece e o resto do sistema segue normal).
  private iniciarVLibras() {
    if (document.getElementById('vlibras-raiz')) return;

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
    script.onerror = () => div.remove(); // sem internet ou bloqueado: sem VLibras, sem erro
    document.body.appendChild(script);
  }
}
