import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly contaExcluida =
    inject(ActivatedRoute).snapshot.queryParamMap.get('aviso') === 'conta-excluida';

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.maxLength(72)]],
  });
  protected readonly enviando = signal(false);
  protected readonly cadastroAberto = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected entrar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, senha } = this.form.getRawValue();
    this.enviando.set(true);
    this.erro.set(null);

    this.auth
      .login(email.trim(), senha)
      .pipe(switchMap(() => this.auth.carregarUsuario()))
      .subscribe({
        next: () => void this.router.navigate(['/']),
        error: (e: unknown) => {
          this.erro.set(mensagemDeErro(e));
          this.enviando.set(false);
        },
      });
  }

  ngOnInit() {
    // Se a configuração não vier (API fora do ar), o link simplesmente não aparece
    this.auth.configuracaoPublica().subscribe({
      next: (c) => this.cadastroAberto.set(c.cadastroPublico),
      error: () => undefined,
    });
  }
}
