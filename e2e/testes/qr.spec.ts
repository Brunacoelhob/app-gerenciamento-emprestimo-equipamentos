import { expect, test } from './base';
import { criarEquipamento, entrarComoAdmin, unico } from './ajudantes';

test('QR code: o administrador abre a etiqueta e o endereço dela filtra a lista pelo código', async ({ page }) => {
  const nome = unico('Item Etiquetado');
  await entrarComoAdmin(page);
  await criarEquipamento(page, nome);

  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(nome) });
  await linha.getByRole('button', { name: 'QR' }).click();

  const janela = page.getByRole('dialog', { name: 'Etiqueta com QR code' });
  await expect(janela.getByRole('img', { name: /QR code do equipamento/ })).toBeVisible();
  const endereco = (await janela.locator('small').textContent()) ?? '';
  expect(endereco).toMatch(/\/equipamentos\?busca=[0-9A-F]{12}$/);
  await expect(janela.getByRole('button', { name: 'Imprimir etiqueta' })).toBeVisible();

  // abrir o endereço do QR leva direto ao equipamento, filtrado pelo código
  await page.keyboard.press('Escape');
  await page.goto(new URL(endereco).pathname + new URL(endereco).search);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2); // o cabeçalho e só ele
});
