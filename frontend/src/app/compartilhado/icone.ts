import { Component, computed, input } from '@angular/core';

// Ícones de traço simples (estilo Lucide/Feather). Decorativos: o texto ao lado é quem descreve.
const ICONES: Record<string, string[]> = {
  casa: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  notebook: [
    'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.3 2.6a1 1 0 0 1-.9 1.4H3.6a1 1 0 0 1-.9-1.4L4 16',
  ],
  troca: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  lista: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  pessoas: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M22 21v-2a4 4 0 0 0-3-3.9',
    'M16 3.1a4 4 0 0 1 0 7.8',
  ],
  pessoa: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  sair: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  fechar: ['M18 6 6 18', 'M6 6l12 12'],
  voltar: ['M19 12H5', 'm12 19-7-7 7-7'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 16v-4', 'M12 8h.01'],
  grafico: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  contraste: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 2v20'],
  lua: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  sol: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2',
    'M12 20v2',
    'm4.9 4.9 1.4 1.4',
    'm17.7 17.7 1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'm4.9 19.1 1.4-1.4',
    'm17.7 6.3 1.4-1.4',
  ],
  olho: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  movimento: ['M5 3l14 9-14 9V3z'],
  maos: [
    'M18 11V6a2 2 0 0 0-4 0v1',
    'M14 10V4a2 2 0 0 0-4 0v6',
    'M10 10.5V6a2 2 0 0 0-4 0v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  ],
  restaurar: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  acessibilidade: [
    'M12 2.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
    'M4 8.5l8 1.5 8-1.5',
    'M12 10v5',
    'm12 15-3.5 6',
    'm12 15 3.5 6',
  ],
};

@Component({
  selector: 'app-icone',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of caminhos(); track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1.25em;
      height: 1.25em;
      flex: none;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class Icone {
  readonly nome = input.required<string>();
  protected readonly caminhos = computed(() => ICONES[this.nome()] ?? []);
}
