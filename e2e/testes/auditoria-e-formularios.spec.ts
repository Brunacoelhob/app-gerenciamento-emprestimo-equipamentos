import { expect, test } from './base';
import { criarEquipamento, entrarComoAdmin, menu, unico } from './ajudantes';

test.describe('auditoria', () => {
  test('mostra data e hora em colunas separadas e a ação com ícone e texto', async ({ page }) => {
    await entrarComoAdmin(page);
    await criarEquipamento(page, unico('Item Colunas'));
    await menu(page).getByRole('link', { name: 'Auditoria', exact: true }).click();

    const cabecalho = page.getByRole('columnheader');
    await expect(cabecalho.nth(0)).toHaveText('Data');
    await expect(cabecalho.nth(1)).toHaveText('Hora');
    const primeira = page.getByRole('row').nth(1);
    await expect(primeira.getByRole('cell').nth(0)).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
    await expect(primeira.getByRole('cell').nth(1)).toHaveText(/^\s*\d{2}:\d{2}:\d{2}\s*$/);
    await expect(primeira).toContainText('Equipamento cadastrado');
  });

  for (const [formato, extensao] of [
    ['PDF', 'pdf'],
    ['Excel', 'xlsx'],
    ['CSV', 'csv'],
  ] as const) {
    test(`exporta o relatório em ${formato}`, async ({ page }) => {
      await entrarComoAdmin(page);
      await menu(page).getByRole('link', { name: 'Auditoria', exact: true }).click();
      await page.getByRole('button', { name: 'Exportar relatório' }).click();

      const baixando = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: new RegExp(formato) }).click();
      const arquivo = await baixando;
      expect(arquivo.suggestedFilename()).toMatch(new RegExp(`\.${extensao}$`));
      await expect(page.locator('.swal2-toast')).toBeVisible();
    });
  }
});

test.describe('formulários', () => {
  test('a senha mostra as regras marcadas enquanto a pessoa digita', async ({ page }) => {
    await page.goto('/registro');
    const regras = page.getByRole('list', { name: 'Requisitos da senha' });
    await expect(regras).toContainText('Pelo menos 8 caracteres');

    await page.getByLabel('Senha', { exact: true }).fill('abc');
    await expect(regras.getByRole('listitem').filter({ hasText: 'Pelo menos 8 caracteres' })).toContainText('✗');
    await expect(regras.getByRole('listitem').filter({ hasText: 'Pelo menos uma letra' })).toContainText('✓');

    await page.getByLabel('Senha', { exact: true }).fill('abcdefg1');
    await expect(regras.getByRole('listitem').filter({ hasText: 'Pelo menos 8 caracteres' })).toContainText('✓');
    await expect(regras.getByRole('listitem').filter({ hasText: 'Pelo menos um número' })).toContainText('✓');
  });

  test('cada campo mostra a sua própria mensagem ao sair dele', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill('isso-nao-e-email');
    await page.getByLabel('Senha', { exact: true }).focus();
    await expect(page.getByText('Informe um e-mail válido')).toBeVisible();
    await expect(page.getByText('Informe a senha.')).toHaveCount(0); // a senha ainda não foi tocada
  });

  test('cancelar a confirmação de desativar não muda nada', async ({ page }) => {
    const nome = unico('Item Confirmado');
    await entrarComoAdmin(page);
    await criarEquipamento(page, nome);
    await page.getByPlaceholder('Buscar pelo nome').fill(nome);
    await page.getByRole('button', { name: 'Buscar' }).click();
    const linha = page.getByRole('row', { name: new RegExp(nome) });
    await linha.getByRole('button', { name: 'Desativar' }).click();
    await expect(page.locator('.swal2-popup')).toContainText('Desativar');
    await page.locator('.swal2-cancel').click();
    await expect(linha).toContainText('Disponível');
  });
});
