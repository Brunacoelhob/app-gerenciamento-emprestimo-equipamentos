import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ErroCampo } from '../../compartilhado/erro-campo';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

@Component({
  selector: 'app-esqueci-senha',
  imports: [ErroCampo, ReactiveFormsModule, RouterLink],
  templateUrl: './esqueci-senha.html',
  styleUrl: '../login/login.scss',
})
export class EsqueciSenha {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);

    this.auth.esqueciSenha(this.form.getRawValue().email.trim()).subscribe({
      // A API responde igual exista a conta ou não: a tela também não revela nada
      next: () => {
        this.enviado.set(true);
        this.enviando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.enviando.set(false);
      },
    });
  }
}
