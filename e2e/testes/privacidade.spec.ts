import { expect, test } from './base';

test.describe('privacidade (LGPD)', () => {
  test('a política abre sem login, tem os itens principais e destaca o que ainda falta definir', async ({ page }) => {
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible();
    for (const secao of ['Quem somos', 'Quais dados coletamos', 'Seus direitos', 'Contato do encarregado']) {
      await expect(page.getByRole('heading', { name: new RegExp(secao) })).toBeVisible();
    }
    await expect(page.locator('.aviso-modelo')).toContainText('Texto preliminar');
    expect(await page.locator('.pendente').count()).toBeGreaterThan(3); // controlador, base legal, prazos, encarregado
  });

  test('o link "Privacidade" está no rodapé de todas as telas e leva à política', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.rodape').getByRole('link', { name: 'Privacidade' }).click();
    await expect(page).toHaveURL(/\/privacidade$/);
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible();
  });

  test('o cadastro tem o aceite, com link para a política', async ({ page }) => {
    await page.goto('/registro');
    const caixa = page.getByLabel(/Li e concordo/);
    await expect(caixa).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
  });
});
