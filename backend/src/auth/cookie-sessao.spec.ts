import type { Request } from 'express';
import { lerCookieSessao, NOME_COOKIE, opcoesCookie, pediuTokenNoCorpo, temCabecalhoAntiCsrf } from './cookie-sessao';

const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;

describe('cookie da sessão', () => {
  it('opções: HttpOnly, SameSite=Strict e caminho restrito às rotas de autenticação', () => {
    expect(opcoesCookie(true, 7)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 86_400_000,
    });
    expect(opcoesCookie(false).secure).toBe(false);
    expect(opcoesCookie(false)).not.toHaveProperty('maxAge'); // ao limpar, não define validade
  });

  it('lê só o cookie da sessão, entre vários, e decodifica o valor', () => {
    expect(lerCookieSessao(req({ cookie: `outro=1; ${NOME_COOKIE}=abc%2Fdef; tema=escuro` }))).toBe('abc/def');
    expect(lerCookieSessao(req({ cookie: 'outro=1' }))).toBeUndefined();
    expect(lerCookieSessao(req({}))).toBeUndefined();
    // um cookie com nome parecido não vale
    expect(lerCookieSessao(req({ cookie: `x${NOME_COOKIE}=nao; ${NOME_COOKIE}x=nao` }))).toBeUndefined();
  });

  it('valor malformado (%) não derruba a requisição', () => {
    expect(lerCookieSessao(req({ cookie: `${NOME_COOKIE}=%E0%A4%A` }))).toBeUndefined();
  });

  it('cabeçalho anti-CSRF e pedido de token no corpo só valem com o valor exato', () => {
    expect(temCabecalhoAntiCsrf(req({ 'x-requested-with': 'emprestimos' }))).toBe(true);
    expect(temCabecalhoAntiCsrf(req({ 'x-requested-with': 'XMLHttpRequest' }))).toBe(false);
    expect(temCabecalhoAntiCsrf(req({}))).toBe(false);
    expect(pediuTokenNoCorpo(req({ 'x-tipo-cliente': 'api' }))).toBe(true);
    expect(pediuTokenNoCorpo(req({ 'x-tipo-cliente': 'navegador' }))).toBe(false);
  });
});
