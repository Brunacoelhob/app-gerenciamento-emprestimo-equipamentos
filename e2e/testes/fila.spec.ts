import { expect, test } from './base';
import { criarEquipamento, criarUsuario, emailUnico, entrar, entrarComoAdmin, menu, sair, SENHA_PADRAO, unico } from './ajudantes';

test('fila de espera: entra na fila de um equipamento emprestado, vê a posição e sai', async ({ page }) => {
  const nome = unico('Item Disputado');
  const pessoa = unico('Pessoa da Fila');
  const email = emailUnico('fila');

  await entrarComoAdmin(page);
  await criarEquipamento(page, nome);
  await criarUsuario(page, pessoa, email);

  // o administrador pega o equipamento
  await menu(page).getByRole('link', { name: 'Equipamentos' }).click();
  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('row', { name: new RegExp(nome) }).getByRole('button', { name: 'Pegar' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.locator('.swal2-toast')).toContainText('emprestado');
  await sair(page);

  // a outra pessoa entra na fila
  await entrar(page, email, SENHA_PADRAO);
  await menu(page).getByRole('link', { name: 'Equipamentos' }).click();
  await page.getByPlaceholder('Buscar pelo nome').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(nome) });
  await expect(linha.getByRole('button', { name: 'Pegar' })).toHaveCount(0);
  await linha.getByRole('button', { name: 'Entrar na fila' }).click();
  await expect(page.locator('.swal2-toast')).toContainText('posição 1');
  await expect(linha).toContainText('Na fila');
  await expect(linha).toContainText('1 na fila');

  const painel = page.getByRole('region', { name: 'Minhas filas de espera' });
  await expect(painel).toContainText(nome);
  await expect(painel).toContainText('1º');

  // sair da fila pede confirmação
  await painel.getByRole('button', { name: 'Sair da fila' }).click();
  await page.locator('.swal2-confirm').click();
  await expect(page.locator('.swal2-toast')).toContainText('saiu da fila');
  await expect(page.getByRole('region', { name: 'Minhas filas de espera' })).toHaveCount(0);
  await expect(linha.getByRole('button', { name: 'Entrar na fila' })).toBeVisible();
});
