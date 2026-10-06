import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, shareReplay, tap, throwError } from 'rxjs';
import { DadosPerfil, Tokens, Usuario } from './modelos';

// O token de renovação vive num cookie HttpOnly que o JavaScript NÃO consegue ler (um XSS não o rouba). Aqui fica só um
// indicador ("já houve login neste navegador") para saber se vale tentar restaurar a sessão ao abrir o app.
const CHAVE_SESSAO = 'emprestimos.sessao';
// O cookie só é aceito pela API junto com este cabeçalho: um formulário de outro site não consegue enviá-lo (anti-CSRF)
const CABECALHO_SESSAO = { 'X-Requested-With': 'emprestimos' };
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
    return this.indicadorDeSessao();
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

  // Configuração pública da tela de login (por enquanto: o cadastro aberto está ligado?)
  configuracaoPublica() {
    return this.http.get<{ cadastroPublico: boolean }>(`${API}/auth/configuracao`);
  }

  cadastrar(nome: string, email: string, senha: string) {
    return this.http.post<Usuario>(`${API}/auth/registro`, {
      nome,
      email,
      senha,
      aceitoPolitica: true,
    });
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
    if (!this.indicadorDeSessao()) return throwError(() => new Error('Sem sessão salva'));

    this.renovacao$ = this.http
      .post<Tokens>(`${API}/auth/renovar`, {}, { headers: CABECALHO_SESSAO })
      .pipe(
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
    const havia = this.indicadorDeSessao();
    this.encerrarLocalmente();
    // O servidor invalida o token e apaga o cookie; se falhar, a sessão local já foi encerrada de qualquer forma
    if (havia)
      this.http
        .post<void>(`${API}/auth/sair`, {}, { headers: CABECALHO_SESSAO })
        .subscribe({ error: () => undefined });
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
      localStorage.setItem(CHAVE_SESSAO, '1');
    } catch {
      /* armazenamento bloqueado: a sessão dura só até recarregar a página */
    }
  }

  private indicadorDeSessao(): boolean {
    try {
      return localStorage.getItem(CHAVE_SESSAO) === '1';
    } catch {
      return false;
    }
  }

  private limpar() {
    this.accessToken = null;
    this.usuario.set(null);
    try {
      localStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* ignora */
    }
  }
}
