import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

// Formulário de troca de senha (usado dentro do perfil).
@Component({
  selector: 'app-alterar-senha',
  imports: [ReactiveFormsModule],
  templateUrl: './alterar-senha.html',
  styleUrl: './alterar-senha.scss',
})
export class AlterarSenha {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    senhaAtual: ['', [Validators.required, Validators.maxLength(72)]],
    // Mesma política da API: 8 a 72 caracteres, com letra e número
    novaSenha: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/(?=.*[A-Za-z])(?=.*\d)/)],
    ],
  });
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
      next: () => this.auth.encerrarLocalmente(),
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.enviando.set(false);
      },
    });
  }
}
