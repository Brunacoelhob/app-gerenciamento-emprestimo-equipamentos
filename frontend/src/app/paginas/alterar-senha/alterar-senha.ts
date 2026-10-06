import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Alertas } from '../../compartilhado/alertas';
import { ErroCampo } from '../../compartilhado/erro-campo';
import { RegrasSenha } from '../../compartilhado/regras-senha';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

// Formulário de troca de senha (usado dentro do perfil).
@Component({
  selector: 'app-alterar-senha',
  imports: [ErroCampo, RegrasSenha, ReactiveFormsModule],
  templateUrl: './alterar-senha.html',
  styleUrl: './alterar-senha.scss',
})
export class AlterarSenha {
  private readonly auth = inject(AuthService);
  private readonly alertas = inject(Alertas);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      senhaAtual: ['', [Validators.required, Validators.maxLength(72)]],
      // Mesma política da API: 8 a 72 caracteres, com letra e número
      novaSenha: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(/(?=.*[A-Za-z])(?=.*\d)/),
        ],
      ],
    },
    {
      // A nova senha precisa ser diferente da atual
      validators: (g) =>
        g.get('senhaAtual')?.value && g.get('senhaAtual')?.value === g.get('novaSenha')?.value
          ? { igualAtual: true }
          : null,
    },
  );
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected salvar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { senhaAtual, novaSenha } = this.form.getRawValue();
    this.enviando.set(true);
    this.erro.set(null);

    this.auth.alterarSenha(senhaAtual, novaSenha).subscribe({
      // A API encerra todas as sessões ao trocar a senha: é preciso entrar de novo
      next: () => {
        this.auth.encerrarLocalmente();
        this.alertas.sucesso('Senha alterada. Entre com a nova senha.');
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.enviando.set(false);
      },
    });
  }
}
