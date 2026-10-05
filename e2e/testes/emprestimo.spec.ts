import { expect, test } from '@playwright/test';
import { criarEquipamento, criarUsuario, emailUnico, entrar, entrarComoAdmin, sair, SENHA_PADRAO, unico, menu } from './ajudantes';

// O fluxo principal do sistema, do começo ao fim, com duas pessoas diferentes
test('administrador cadastra equipamento e conta; a pessoa pega emprestado, vê em "Meus empréstimos" e devolve', async ({ page }) => {
  const equipamento = unico('Notebook E2E');
  const pessoa = unico('Pessoa E2E');
  const email = emailUnico('pessoa');

  // --- administrador prepara o cenário
  await entrarComoAdmin(page);
  await criarEquipamento(page, equipamento);
  await criarUsuario(page, pessoa, email);
  await sair(page);

  // --- a pessoa entra: vê só o que um usuário comum vê
  await entrar(page, email, SENHA_PADRAO);
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);
  await page.goto('/usuarios'); // a rota de administrador não abre para ela
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // --- pega o equipamento emprestado
  await menu.getByRole('link', { name: 'Equipamentos' }).click();
  await page.getByPlaceholder('Buscar pelo nome').fill(equipamento);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(equipamento) });
  await expect(linha).toContainText('Disponível');
  await linha.getByRole('button', { name: 'Pegar' }).click();
  await page.getByLabel('Por quantos dias?').fill('3');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('status')).toContainText('emprestado por 3 dia(s)');
  await expect(linha).toContainText('Emprestado');
  await expect(linha.getByRole('button', { name: 'Pegar' })).toHaveCount(0); // ninguém mais pega o mesmo item

  // --- aparece em "Meus empréstimos" e o dashboard conta
  await menu.getByRole('link', { name: 'Meus empréstimos' }).click();
  const meu = page.getByRole('row', { name: new RegExp(equipamento) });
  await expect(meu).toContainText('Em andamento');
  await menu.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByText('Com você agora').locator('..').locator('..')).toContainText(equipamento);

  // --- devolve
  await menu.getByRole('link', { name: 'Meus empréstimos' }).click();
  await meu.getByRole('button', { name: 'Devolver' }).click();
  await expect(page.getByRole('status')).toContainText('devolvido');
  await expect(meu).toContainText('Devolvido em');

  // --- o equipamento voltou a ficar disponível
  await menu.getByRole('link', { name: 'Equipamentos' }).click();
  await page.getByPlaceholder('Buscar pelo nome').fill(equipamento);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(equipamento) })).toContainText('Disponível');
});

test('administrador desativa e reativa um equipamento; o histórico fica na auditoria', async ({ page }) => {
  const equipamento = unico('Projetor E2E');
  await entrarComoAdmin(page);
  await criarEquipamento(page, equipamento);

  await page.getByPlaceholder('Buscar pelo nome').fill(equipamento);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(equipamento) });
  await linha.getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByRole('status')).toContainText('desativado');
  await expect(linha).toContainText('Desativado');
  await expect(linha.getByRole('button', { name: 'Pegar' })).toHaveCount(0);

  await linha.getByRole('button', { name: 'Reativar' }).click();
  await expect(linha).toContainText('Disponível');

  await menu(page).getByRole('link', { name: 'Auditoria', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: equipamento }).first()).toBeVisible();
});

test('conta criada pelo administrador pode ser desativada e deixa de entrar', async ({ page }) => {
  const nome = unico('Pessoa Desativada');
  const email = emailUnico('desativada');
  await entrarComoAdmin(page);
  await criarUsuario(page, nome, email);

  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(nome);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const linha = page.getByRole('row', { name: new RegExp(nome) });
  await linha.getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByRole('status')).toContainText('desativada');
  await sair(page);

  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('Credenciais inválidas');
});
