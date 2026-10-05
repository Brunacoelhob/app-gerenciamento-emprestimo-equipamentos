import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const tokens = (n: number) => ({
  accessToken: `acesso-${n}`,
  refreshToken: `renovacao-${n}-xxxxxxxxxxxxxxxxxxxx`,
  tipo: 'Bearer' as const,
  accessTokenExpiraEm: new Date().toISOString(),
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it('envia o access token no cabeçalho Authorization', () => {
    auth.login('a@b.com', 'x').subscribe();
    backend.expectOne('/api/v1/auth/login').flush(tokens(1));

    http.get('/api/v1/equipamentos').subscribe();
    const req = backend.expectOne('/api/v1/equipamentos');
    expect(req.request.headers.get('Authorization')).toBe('Bearer acesso-1');
  });

  it('em 401 renova uma única vez e repete a requisição, mesmo com várias falhas simultâneas', () => {
    auth.login('a@b.com', 'x').subscribe();
    backend.expectOne('/api/v1/auth/login').flush(tokens(1));

    const respostas: unknown[] = [];
    http.get('/api/v1/a').subscribe((r) => respostas.push(r));
    http.get('/api/v1/b').subscribe((r) => respostas.push(r));

    backend.expectOne('/api/v1/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/b').flush(null, { status: 401, statusText: 'Unauthorized' });

    // Só UMA chamada de renovação, usando o refresh token salvo
    const renovar = backend.expectOne('/api/v1/auth/renovar');
    expect(renovar.request.body).toEqual({ refreshToken: tokens(1).refreshToken });
    renovar.flush(tokens(2));

    const a = backend.expectOne('/api/v1/a');
    const b = backend.expectOne('/api/v1/b');
    expect(a.request.headers.get('Authorization')).toBe('Bearer acesso-2');
    a.flush('ok-a');
    b.flush('ok-b');
    expect(respostas).toEqual(['ok-a', 'ok-b']);
  });

  it('se a renovação falhar, encerra a sessão e volta ao login', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.login('a@b.com', 'x').subscribe();
    backend.expectOne('/api/v1/auth/login').flush(tokens(1));

    let falhou = false;
    http.get('/api/v1/a').subscribe({ error: () => (falhou = true) });
    backend.expectOne('/api/v1/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/renovar').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(falhou).toBe(true);
    expect(auth.token).toBeNull();
    expect(auth.temSessaoSalva).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });

  it('não tenta renovar quando o login falha com 401', () => {
    let status = 0;
    auth.login('a@b.com', 'errada').subscribe({ error: (e) => (status = e.status) });
    backend.expectOne('/api/v1/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    backend.expectNone('/api/v1/auth/renovar');
  });
});
