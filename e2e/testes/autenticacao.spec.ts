import { expect, test } from '@playwright/test';
import { entrarComoAdmin, sair, ADMIN } from './ajudantes';

test.describe('autenticação', () => {
  test('rota protegida sem login leva ao login', async ({ page }) => {
    await page.goto('/equipamentos');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Empréstimo de Equipamentos' })).toBeVisible();
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
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
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
});
