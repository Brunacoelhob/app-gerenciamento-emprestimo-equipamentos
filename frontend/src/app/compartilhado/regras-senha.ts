import { Component, computed, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

type Estado = 'pendente' | 'ok' | 'falha';

// As regras da senha, uma a uma, marcadas em tempo real enquanto a pessoa digita (a mesma política da API:
// 8 a 72 caracteres, com letra e número). Cada regra tem texto E símbolo: a cor não é a única pista.
@Component({
  selector: 'app-regras-senha',
  template: `
    <ul class="regras" aria-label="Requisitos da senha">
      @for (r of regras(); track r.texto) {
        <li [attr.data-estado]="r.estado">
          <span class="marca" aria-hidden="true">{{ marca(r.estado) }}</span>
          {{ r.texto }}
          <span class="so-leitor">{{
            r.estado === 'ok'
              ? '(atendido)'
              : r.estado === 'falha'
                ? '(não atendido)'
                : '(ainda não digitado)'
          }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .regras {
      margin: 0.1rem 0 0;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
      color: var(--texto-suave);
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.05rem 0;
    }
    .marca {
      display: inline-grid;
      place-items: center;
      width: 1.1rem;
      font-weight: 700;
    }
    li[data-estado='ok'] {
      color: var(--sucesso);
    }
    li[data-estado='falha'] {
      color: var(--erro);
    }
  `,
})
export class RegrasSenha {
  readonly controle = input.required<AbstractControl>();

  protected marca(estado: Estado) {
    return estado === 'ok' ? '✓' : estado === 'falha' ? '✗' : '○';
  }

  private readonly versao = signal(0);

  constructor() {
    effect((limpar) => {
      const sub = this.controle().events.subscribe(() => this.versao.update((v) => v + 1));
      limpar(() => sub.unsubscribe());
    });
  }

  protected readonly regras = computed(() => {
    this.versao();
    return this.calcular();
  });

  private calcular(): { texto: string; estado: Estado }[] {
    const valor = String(this.controle().value ?? '');
    const digitou = valor.length > 0;
    const estado = (atende: boolean): Estado => (!digitou ? 'pendente' : atende ? 'ok' : 'falha');
    return [
      { texto: 'Pelo menos 8 caracteres', estado: estado(valor.length >= 8) },
      { texto: 'Pelo menos uma letra', estado: estado(/[A-Za-z]/.test(valor)) },
      { texto: 'Pelo menos um número', estado: estado(/\d/.test(valor)) },
      { texto: 'No máximo 72 caracteres', estado: estado(valor.length <= 72) },
    ];
  }
}
