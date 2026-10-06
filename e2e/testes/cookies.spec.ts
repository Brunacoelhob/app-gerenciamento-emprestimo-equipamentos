import { expect, test } from '@playwright/test';

// Aqui o "test" é o puro (sem aceitar o aviso automaticamente)
test.describe('aviso de cookies', () => {
  const aviso = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Cookies e privacidade' });

  test('aparece com três opções e volta a aparecer toda vez que a página é atualizada', async ({ page }) => {
    await page.goto('/login');
    await expect(aviso(page)).toBeVisible();
    await expect(aviso(page).getByRole('button', { name: 'Aceitar' })).toBeVisible();
    await expect(aviso(page).getByRole('button', { name: 'Recusar' })).toBeVisible();
    await expect(aviso(page).getByRole('button', { name: 'Configurar' })).toBeVisible();

    await aviso(page).getByRole('button', { name: 'Aceitar' }).click();
    await expect(aviso(page)).toHaveCount(0);

    await page.reload();
    await expect(aviso(page)).toBeVisible();
  });

  test('recusar não guarda as preferências de acessibilidade', async ({ page }) => {
    await page.goto('/login');
    await aviso(page).getByRole('button', { name: 'Recusar' }).click();
    await page.getByRole('button', { name: 'Dislexia' }).click();
    const guardado = await page.evaluate(() => localStorage.getItem('emprestimos.acessibilidade'));
    expect(guardado).toBeNull();
  });

  test('configurar: os necessários ficam travados e dá para ligar só o que se quer', async ({ page }) => {
    await page.goto('/login');
    await aviso(page).getByRole('button', { name: 'Configurar' }).click();
    await expect(aviso(page).getByRole('checkbox')).toHaveCount(3);
    await expect(aviso(page).getByRole('checkbox').first()).toBeDisabled();
    await aviso(page).getByRole('checkbox').nth(2).uncheck(); // sem serviços de terceiros
    await aviso(page).getByRole('button', { name: 'Salvar escolhas' }).click();
    await expect(aviso(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Dislexia' }).click();
    const guardado = await page.evaluate(() => localStorage.getItem('emprestimos.acessibilidade'));
    expect(guardado).toContain('"dislexia":true'); // funcionais ficaram ligados
    await expect(page.locator('#vlibras-raiz')).toHaveCount(0); // terceiros ficaram desligados
  });

  test('o aviso aponta para a política de privacidade', async ({ page }) => {
    await page.goto('/login');
    await expect(aviso(page).getByRole('link', { name: /Política de Privacidade/ })).toHaveAttribute('href', '/privacidade');
  });
});
