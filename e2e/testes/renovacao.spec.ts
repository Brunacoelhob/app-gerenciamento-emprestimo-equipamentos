import { expect, test } from './base';
import { criarEquipamento, entrarComoAdmin, menu, unico } from './ajudantes';

test('renovar o prazo: confirma, soma 7 dias, conta a renovação e para no limite de 2', async ({ page }) => {
  const nome = unico('Item Renovável');
  await entrarComoAdmin(page);
  await criarEquipamento(page, nome);

  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('row', { name: new RegExp(nome) }).getByRole('button', { name: 'Pegar' }).click();
  await page.getByLabel('Por quantos dias?').fill('3');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.locator('.swal2-toast')).toContainText('emprestado');

  await menu(page).getByRole('link', { name: 'Meus empréstimos' }).click();
  const linha = page.getByRole('row', { name: new RegExp(nome) });
  await expect(linha.getByRole('button', { name: 'Renovar' })).toBeVisible();

  // cancelar não renova
  await linha.getByRole('button', { name: 'Renovar' }).click();
  await page.locator('.swal2-cancel').click();
  await expect(linha).not.toContainText('renovado');

  // 1ª renovação
  await linha.getByRole('button', { name: 'Renovar' }).click();
  await page.locator('.swal2-confirm').click();
  await expect(page.locator('.swal2-toast')).toContainText('renovado até');
  await expect(linha).toContainText('renovado 1×');

  // 2ª renovação: depois dela o botão some
  await linha.getByRole('button', { name: 'Renovar' }).click();
  await page.locator('.swal2-confirm').click();
  await expect(linha).toContainText('renovado 2×');
  await expect(linha.getByRole('button', { name: 'Renovar' })).toHaveCount(0);
  await expect(linha.getByRole('button', { name: 'Devolver' })).toBeVisible();
});
