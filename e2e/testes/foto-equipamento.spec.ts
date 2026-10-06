import { expect, test } from './base';
import { criarEquipamento, entrarComoAdmin, pngValido, unico } from './ajudantes';

test('foto do equipamento: o administrador envia, ela aparece na lista (aberta sem login) e pode ser removida', async ({ page, browser, baseURL }) => {
  const nome = unico('Item Fotografado');
  await entrarComoAdmin(page);
  await criarEquipamento(page, nome);

  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(nome) });
  await expect(linha.locator('.miniatura img')).toHaveCount(0); // ainda sem foto: mostra o ícone

  await linha.getByRole('button', { name: 'Editar' }).click();
  await page.locator('input[type=file].so-leitor').setInputFiles({ name: 'item.png', mimeType: 'image/png', buffer: pngValido() });
  await expect(page.locator('.swal2-toast')).toContainText('Foto atualizada');
  await expect(linha.locator('.miniatura img')).toBeVisible();

  // a imagem carrega de verdade (não é um link quebrado) e abre sem estar logado
  const src = await linha.locator('.miniatura img').getAttribute('src');
  expect(src).toMatch(/\/equipamentos\/foto\/[0-9A-F]{12}\?v=\d+/);
  const anonimo = await (await browser.newContext({ baseURL })).newPage();
  const resposta = await anonimo.request.get(src!);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toContain('image/jpeg'); // o navegador reduz e converte para JPEG
  await anonimo.close();

  await page.getByRole('button', { name: 'Remover' }).click();
  await expect(page.locator('.swal2-toast')).toContainText('Foto removida');
  await expect(linha.locator('.miniatura img')).toHaveCount(0);
});

test('arquivo que não é imagem é recusado antes de ir para a API', async ({ page }) => {
  const nome = unico('Item Sem Foto');
  await entrarComoAdmin(page);
  await criarEquipamento(page, nome);
  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('row', { name: new RegExp(nome) }).getByRole('button', { name: 'Editar' }).click();
  await page.locator('input[type=file].so-leitor').setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
  await expect(page.locator('.swal2-popup')).toContainText('PNG, JPEG ou WEBP');
});
