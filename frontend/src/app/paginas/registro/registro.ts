import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ErroCampo } from '../../compartilhado/erro-campo';
import { RegrasSenha } from '../../compartilhado/regras-senha';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

const senhasIguais = (grupo: AbstractControl): ValidationErrors | null =>
  grupo.get('senha')?.value === grupo.get('confirmacao')?.value ? null : { diferentes: true };

@Component({
  selector: 'app-registro',
  imports: [ErroCampo, RegrasSenha, ReactiveFormsModule, RouterLink],
  templateUrl: './registro.html',
  styleUrl: '../login/login.scss',
})
export class Registro {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      // Mesma política da API: 8 a 72 caracteres, com letra e número
      senha: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(/(?=.*[A-Za-z])(?=.*\d)/),
        ],
      ],
      confirmacao: ['', [Validators.required]],
    },
    { validators: senhasIguais },
  );
  protected readonly enviando = signal(false);
  protected readonly criada = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected cadastrar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nome, email, senha } = this.form.getRawValue();
    this.enviando.set(true);
    this.erro.set(null);

    this.auth.cadastrar(nome.trim(), email.trim(), senha).subscribe({
      next: () => {
        this.criada.set(true);
        this.enviando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.enviando.set(false);
      },
    });
  }
}
