import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, shareReplay, tap, throwError } from 'rxjs';
import { DadosPerfil, Tokens, Usuario } from './modelos';

const CHAVE_REFRESH = 'emprestimos.refreshToken';
export const API = '/api/v1'; // o proxy de desenvolvimento remove o "/api"; a API versiona suas rotas em /v1

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // O access token (15 min) fica só em memória; o refresh token (uso único) sobrevive a recarregar a página.
  private accessToken: string | null = null;
  private renovacao$: Observable<string> | null = null;

  readonly usuario = signal<Usuario | null>(null);
  readonly autenticado = computed(() => this.usuario() !== null);
  readonly ehAdmin = computed(() => this.usuario()?.role === 'ADMIN');

  get token(): string | null {
    return this.accessToken;
  }

  get temSessaoSalva(): boolean {
    return this.lerRefresh() !== null;
  }

  login(email: string, senha: string) {
    return this.http.post<Tokens>(`${API}/auth/login`, { email, senha }).pipe(
      tap((t) => this.guardar(t)),
      map(() => undefined),
    );
  }

  carregarUsuario() {
    return this.http.get<Usuario>(`${API}/auth/eu`).pipe(tap((u) => this.usuario.set(u)));
  }

  atualizarPerfil(dados: DadosPerfil) {
    return this.http.patch<Usuario>(`${API}/auth/eu`, dados).pipe(tap((u) => this.usuario.set(u)));
  }

  // LGPD: levar os próprios dados e excluir a conta (anonimização)
  baixarMeusDados() {
    return this.http.get(`${API}/auth/eu/dados`, { responseType: 'blob' });
  }

  excluirConta(senha: string) {
    return this.http.post<void>(`${API}/auth/eu/anonimizar`, { senha });
  }

  // Recuperação de senha: a resposta é sempre a mesma (204), exista a conta ou não
  esqueciSenha(email: string) {
    return this.http.post<void>(`${API}/auth/esqueci-senha`, { email });
  }

  redefinirSenha(token: string, novaSenha: string) {
    return this.http.post<void>(`${API}/auth/redefinir-senha`, { token, novaSenha });
  }

  // Troca o refresh token por um par novo. Chamadas simultâneas compartilham UMA renovação:
  // o refresh token é de uso único e reapresentá-lo derrubaria todas as sessões da pessoa.
  renovar(): Observable<string> {
    if (this.renovacao$) return this.renovacao$;
    const refreshToken = this.lerRefresh();
    if (!refreshToken) return throwError(() => new Error('Sem sessão salva'));

    this.renovacao$ = this.http.post<Tokens>(`${API}/auth/renovar`, { refreshToken }).pipe(
      tap((t) => this.guardar(t)),
      map((t) => t.accessToken),
      catchError((erro) => {
        this.limpar();
        return throwError(() => erro);
      }),
      finalize(() => (this.renovacao$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.renovacao$;
  }

  alterarSenha(senhaAtual: string, novaSenha: string) {
    return this.http.patch<void>(`${API}/auth/senha`, { senhaAtual, novaSenha });
  }

  // Encerra a sessão no servidor (idempotente) e localmente.
  sair() {
    const refreshToken = this.lerRefresh();
    this.encerrarLocalmente();
    if (refreshToken) this.http.post<void>(`${API}/auth/sair`, { refreshToken }).subscribe({ error: () => undefined });
  }

  // Sessão acabou (renovação falhou ou senha trocada): limpa tudo e volta ao login.
  encerrarLocalmente(motivo?: 'conta-excluida') {
    this.limpar();
    if (motivo) void this.router.navigate(['/login'], { queryParams: { aviso: motivo } });
    else void this.router.navigate(['/login']);
  }

  private guardar(t: Tokens) {
    this.accessToken = t.accessToken;
    try {
      localStorage.setItem(CHAVE_REFRESH, t.refreshToken);
    } catch {
      /* armazenamento bloqueado: a sessão dura só até recarregar a página */
    }
  }

  private lerRefresh(): string | null {
    try {
      return localStorage.getItem(CHAVE_REFRESH);
    } catch {
      return null;
    }
  }

  private limpar() {
    this.accessToken = null;
    this.usuario.set(null);
    try {
      localStorage.removeItem(CHAVE_REFRESH);
    } catch {
      /* ignora */
    }
  }
}
