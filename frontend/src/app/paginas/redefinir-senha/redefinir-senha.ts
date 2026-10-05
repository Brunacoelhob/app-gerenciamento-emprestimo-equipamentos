import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

const senhasIguais = (grupo: AbstractControl): ValidationErrors | null =>
  grupo.get('novaSenha')?.value === grupo.get('confirmacao')?.value ? null : { diferentes: true };

@Component({
  selector: 'app-redefinir-senha',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './redefinir-senha.html',
  styleUrl: '../login/login.scss',
})
export class RedefinirSenha implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private token = '';
  protected readonly semToken = signal(false);
  protected readonly enviando = signal(false);
  protected readonly concluido = signal(false);
  protected readonly erro = signal<string | null>(null);
  // Link já usado ou vencido: a API recusou o código (diferente de um erro de senha fraca ou de rede)
  protected readonly linkInvalido = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      // Mesma política da API: 8 a 72 caracteres, com letra e número
      novaSenha: [
        '',
        [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/(?=.*[A-Za-z])(?=.*\d)/)],
      ],
      confirmacao: ['', [Validators.required]],
    },
    { validators: senhasIguais },
  );

  ngOnInit() {
    this.token = this.rota.snapshot.queryParamMap.get('token') ?? '';
    this.semToken.set(this.token.length < 20);
    // Tira o código do endereço: ele não fica no histórico do navegador nem vai no cabeçalho Referer
    if (this.token) void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected salvar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);

    this.auth.redefinirSenha(this.token, this.form.getRawValue().novaSenha).subscribe({
      next: () => {
        this.concluido.set(true);
        this.enviando.set(false);
      },
      error: (e: unknown) => {
        const mensagem = mensagemDeErro(e);
        this.linkInvalido.set(mensagem.includes('inválido ou expirou'));
        this.erro.set(mensagem);
        this.enviando.set(false);
      },
    });
  }
}
