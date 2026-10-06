import { Component, computed, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

// Mensagem de erro de UM campo, dizendo qual regra falhou e quanto falta (nada de "campo inválido" genérico).
// Aparece só depois que a pessoa mexeu no campo (saiu dele ou digitou), nunca em cima de um formulário recém-aberto.
// A região é "aria-live": o leitor de tela anuncia a mensagem quando ela surge, sem tirar o foco do campo.
@Component({
  selector: 'app-erro-campo',
  template: `<span class="erro-campo" aria-live="polite">{{ texto() }}</span>`,
  styles: `
    .erro-campo:empty {
      display: none;
    }
  `,
})
export class ErroCampo {
  readonly controle = input.required<AbstractControl>();
  /** Nome do campo nas mensagens padrão ("O campo X precisa..."). */
  readonly rotulo = input('campo');
  /** Mensagens próprias por regra: { required: '...', formato: '...' }. Têm prioridade sobre as padrão. */
  readonly mensagens = input<Record<string, string>>({});
  /** Regras que NÃO devem aparecer aqui (a senha mostra as dela numa lista própria). */
  readonly ignorar = input<string[]>([]);

  // O app não usa zone.js: o texto precisa reagir aos eventos do controle (tocado, valor, validade) por conta própria
  private readonly versao = signal(0);

  constructor() {
    effect((limpar) => {
      const sub = this.controle().events.subscribe(() => this.versao.update((v) => v + 1));
      limpar(() => sub.unsubscribe());
    });
  }

  protected readonly texto = computed(() => {
    this.versao();
    return this.calcular();
  });

  private calcular(): string {
    const c = this.controle();
    if (!c.invalid || !(c.touched || c.dirty) || !c.errors) return '';

    const erros = c.errors;
    const proprias = this.mensagens();
    // A primeira regra que falhou, na ordem em que o campo as declarou
    for (const chave of Object.keys(erros)) {
      if (this.ignorar().includes(chave)) continue;
      if (proprias[chave]) return proprias[chave];
      return this.padrao(chave, erros[chave] as Record<string, number> | true);
    }
    return '';
  }

  private padrao(chave: string, dados: Record<string, number> | true): string {
    const nome = this.rotulo();
    const d = dados === true ? ({} as Record<string, number>) : dados;
    switch (chave) {
      case 'required':
        return `Preencha o campo ${nome}.`;
      case 'email':
        return 'Informe um e-mail válido, como nome@empresa.com.';
      case 'minlength':
        return `O campo ${nome} precisa ter pelo menos ${d['requiredLength']} caracteres (agora tem ${d['actualLength']}).`;
      case 'maxlength':
        return `O campo ${nome} pode ter no máximo ${d['requiredLength']} caracteres (agora tem ${d['actualLength']}).`;
      default:
        return `O formato do campo ${nome} não é válido.`;
    }
  }
}
