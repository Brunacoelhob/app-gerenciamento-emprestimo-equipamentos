import { expect, test } from './base';
import { entrarComoAdmin, sair, ADMIN } from './ajudantes';

test.describe('autenticação', () => {
  test('rota protegida sem login leva ao login', async ({ page }) => {
    await page.goto('/equipamentos');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Equipment loan' })).toBeVisible();
  });

  test('senha errada mostra erro e não entra', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(ADMIN.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciais inválidas');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('campos vazios são validados antes de chamar a API', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Informe o e-mail.')).toBeVisible();
    await expect(page.getByText('Informe a senha.')).toBeVisible();
  });

  test('administrador entra, vê o menu de administração, recarrega a página sem perder a sessão e sai', async ({ page }) => {
    await entrarComoAdmin(page);
    const menu = page.getByRole('navigation', { name: 'Principal' });
    await expect(menu.getByRole('link', { name: 'Usuários' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Auditoria' })).toBeVisible();

    // F5: a sessão é restaurada pelo refresh token, sem pedir senha de novo
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await sair(page);
    // depois de sair, a sessão não volta sozinha
    await page.goto('/equipamentos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('quem já está logado é levado do login para o dashboard', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('o token de renovação fica num cookie HttpOnly: o JavaScript da página não o enxerga (um XSS não o rouba)', async ({ page, context }) => {
    await entrarComoAdmin(page);

    // o navegador guarda o cookie, protegido
    const cookie = (await context.cookies()).find((c) => c.name === 'emp_sessao');
    expect(cookie).toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    expect(cookie!.path).toBe('/api/v1/auth');

    // ...mas nenhum script da página consegue lê-lo, nem achá-lo no armazenamento
    const visivelAoScript = await page.evaluate(() => ({
      cookies: document.cookie,
      armazenamento: JSON.stringify({ ...localStorage, ...sessionStorage }),
    }));
    expect(visivelAoScript.cookies).not.toContain('emp_sessao');
    expect(visivelAoScript.armazenamento).not.toContain(cookie!.value);
    const guardado = JSON.parse(visivelAoScript.armazenamento) as Record<string, string>;
    expect(guardado['emprestimos.sessao']).toBe('1'); // só um indicador, sem segredo
    expect(Object.keys(guardado).filter((k) => /token|refresh/i.test(k))).toEqual([]);
  });

  test('sair apaga o cookie no navegador e a sessão não volta ao recarregar', async ({ page, context }) => {
    await entrarComoAdmin(page);
    expect((await context.cookies()).some((c) => c.name === 'emp_sessao')).toBe(true);
    await sair(page);
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'emp_sessao')).toBe(false);
    await page.goto('/equipamentos');
    await expect(page).toHaveURL(/\/login$/);
  });
});
