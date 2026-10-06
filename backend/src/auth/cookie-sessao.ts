import type { CookieOptions, Request, Response } from 'express';

// O refresh token vai num cookie HttpOnly: o JavaScript da página nunca o enxerga, então um XSS não consegue roubá-lo.
//   - HttpOnly:  invisível para scripts
//   - Secure:    só por HTTPS (em produção)
//   - SameSite=Strict: o navegador não o envia em requisições vindas de outros sites (defesa contra CSRF)
//   - Path restrito às rotas de autenticação: não viaja junto com cada chamada da API
export const NOME_COOKIE = 'emp_sessao';
export const CAMINHO_COOKIE = '/v1/auth';

// Quem usa o cookie precisa mandar este cabeçalho. Um formulário de outro site não consegue defini-lo, e um
// fetch de outro site dispararia um pré-voo (CORS) que a API recusa: é a segunda barreira contra CSRF.
export const CABECALHO_ANTI_CSRF = 'x-requested-with';
export const VALOR_ANTI_CSRF = 'emprestimos';

// Clientes que NÃO são navegadores (scripts, integrações) podem pedir o refresh token no corpo da resposta
export const CABECALHO_CLIENTE_API = 'x-tipo-cliente';

export function opcoesCookie(seguro: boolean, dias?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: seguro,
    sameSite: 'strict',
    path: CAMINHO_COOKIE,
    ...(dias !== undefined && { maxAge: dias * 86_400_000 }),
  };
}

/** Lê o cookie da sessão sem depender de um pacote de cookies. */
export function lerCookieSessao(req: Request): string | undefined {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return undefined;
  for (const par of cabecalho.split(';')) {
    const [nome, ...resto] = par.trim().split('=');
    if (nome === NOME_COOKIE) {
      try {
        return decodeURIComponent(resto.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function pediuTokenNoCorpo(req: Request): boolean {
  return req.headers[CABECALHO_CLIENTE_API] === 'api';
}

export function temCabecalhoAntiCsrf(req: Request): boolean {
  return req.headers[CABECALHO_ANTI_CSRF] === VALOR_ANTI_CSRF;
}

export function limparCookie(res: Response, seguro: boolean) {
  res.clearCookie(NOME_COOKIE, opcoesCookie(seguro));
}
