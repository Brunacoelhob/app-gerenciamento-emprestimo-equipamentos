import { Component, computed, input } from '@angular/core';

export const ANIMAIS = [
  'cachorro',
  'gato',
  'raposa',
  'panda',
  'coala',
  'leao',
  'sapo',
  'macaco',
  'pinguim',
  'coruja',
  'tartaruga',
  'polvo',
] as const;

export const rotuloAnimal = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1).replace('leao', 'leão');

// Avatar da pessoa: item do acervo ("animal:gato"), foto enviada (data URL) ou, sem nada, as iniciais do nome.
@Component({
  selector: 'app-avatar',
  template: `
    @if (imagem(); as src) {
      <img [src]="src" alt="" />
    } @else {
      <span aria-hidden="true">{{ iniciais() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      overflow: hidden;
      border-radius: 50%;
      background: var(--primaria);
      color: var(--on-primaria);
      font-weight: 700;
      user-select: none;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #fff;
    }
  `,
  host: {
    '[style.width.px]': 'tamanho()',
    '[style.height.px]': 'tamanho()',
    '[style.font-size.px]': 'tamanho() * 0.4',
  },
})
export class Avatar {
  readonly valor = input<string | null | undefined>(null);
  readonly nome = input<string | null | undefined>('');
  readonly tamanho = input(40);

  protected readonly imagem = computed(() => {
    const v = this.valor();
    if (v?.startsWith('animal:')) return `avatares/${v.slice(7)}.svg`;
    if (v?.startsWith('data:image/')) return v;
    return null;
  });

  protected readonly iniciais = computed(() => {
    const partes = (this.nome() ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  });
}
