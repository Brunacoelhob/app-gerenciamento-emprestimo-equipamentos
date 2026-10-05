import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Avatar } from '../../compartilhado/avatar';
import { Paginacao } from '../../compartilhado/paginacao';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro';
import { Pagina, Role, Usuario } from '../../core/modelos';
import { UsuariosService } from '../../core/usuarios.service';

@Component({
  selector: 'app-usuarios',
  imports: [ReactiveFormsModule, FormsModule, Avatar, Paginacao],
  templateUrl: './usuarios.html',
})
export class Usuarios implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly servico = inject(UsuariosService);

  protected readonly dados = signal<Pagina<Usuario> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly criando = signal(false);
  protected readonly salvando = signal(false);

  protected role: Role | '' = '';
  protected ativo: '' | 'true' | 'false' = '';
  protected busca = '';

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    // Mesma política da API: 8 a 72 caracteres, com letra e número
    senha: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/(?=.*[A-Za-z])(?=.*\d)/)]],
    role: ['USER' as Role],
  });

  ngOnInit() {
    this.carregar(1);
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.servico.listar({ role: this.role, ativo: this.ativo, busca: this.busca, pagina }).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.carregando.set(false);
      },
    });
  }

  protected filtrar() {
    this.erro.set(null);
    this.carregar(1);
  }

  protected abrirCriacao() {
    this.form.reset({ nome: '', email: '', senha: '', role: 'USER' });
    this.erro.set(null);
    this.criando.set(true);
  }

  protected criar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    const dados = this.form.getRawValue();

    this.servico.criar(dados).subscribe({
      next: (u) => {
        this.salvando.set(false);
        this.criando.set(false);
        this.aviso.set(`Conta de ${u.nome} criada. Passe a senha para a pessoa por um canal seguro.`);
        this.carregar(1);
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }

  protected alternarRole(u: Usuario) {
    const novo: Role = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
    this.atualizar(u, { role: novo }, `${u.nome} agora é ${novo === 'ADMIN' ? 'administrador' : 'usuário comum'}.`);
  }

  protected alternarAtivo(u: Usuario) {
    this.atualizar(u, { ativo: !u.ativo }, u.ativo ? `Conta de ${u.nome} desativada.` : `Conta de ${u.nome} reativada.`);
  }

  private atualizar(u: Usuario, dados: { role?: Role; ativo?: boolean }, sucesso: string) {
    this.erro.set(null);
    this.aviso.set(null);
    this.servico.atualizar(u.id, dados).subscribe({
      next: () => {
        this.aviso.set(sucesso);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (e: unknown) => this.erro.set(mensagemDeErro(e)),
    });
  }
}
