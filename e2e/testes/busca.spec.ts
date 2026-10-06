import { expect, test } from './base';
import { criarEquipamento, criarUsuario, emailUnico, entrar, entrarComoAdmin, menu, sair, SENHA_PADRAO, unico } from './ajudantes';

// Busca por texto nas listagens: a pesquisa roda enquanto a pessoa digita (sem precisar apertar "Buscar")
test.describe('busca por texto', () => {
  test('equipamentos: acha pelo nome OU pela descrição, enquanto digita', async ({ page }) => {
    const palavra = unico('Zeta').replace(/\s/g, '');
    const equipamento = unico('Item Buscável');
    await entrarComoAdmin(page);
    await criarEquipamento(page, equipamento, `contém a palavra ${palavra} só na descrição`);

    const campo = page.getByPlaceholder('Buscar pelo nome ou descrição');
    await campo.fill(palavra); // sem clicar em Buscar
    await expect(page.getByRole('row', { name: new RegExp(equipamento) })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(2); // o cabeçalho e a única linha que casa

    await campo.fill(`${palavra}-que-nao-existe`);
    await expect(page.getByText('Nenhum equipamento encontrado.')).toBeVisible();
  });

  test('usuários: filtra por nome ou e-mail enquanto digita', async ({ page }) => {
    const nome = unico('Pessoa Procurada');
    const email = emailUnico('procurada');
    await entrarComoAdmin(page);
    await criarUsuario(page, nome, email);

    const campo = page.getByPlaceholder('Buscar por nome ou e-mail');
    await campo.fill(email.split('@')[0]);
    await expect(page.getByRole('row', { name: new RegExp(nome) })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(2);

    await campo.fill('nao-existe-ninguem-assim');
    await expect(page.getByText('Nenhum usuário encontrado.')).toBeVisible();
  });

  test('empréstimos: "meus" busca pelo equipamento; o administrador também busca pela pessoa', async ({ page }) => {
    const equipamento = unico('Notebook Achável');
    const nome = unico('Pessoa Emprestadora');
    const email = emailUnico('emprestadora');

    await entrarComoAdmin(page);
    await criarEquipamento(page, equipamento);
    await criarUsuario(page, nome, email);
    await sair(page);

    // a pessoa pega o equipamento e procura nos próprios empréstimos
    await entrar(page, email, SENHA_PADRAO);
    await menu(page).getByRole('link', { name: 'Equipamentos', exact: true }).click();
    await page.getByPlaceholder('Buscar pelo nome').fill(equipamento);
    await page.getByRole('row', { name: new RegExp(equipamento) }).getByRole('button', { name: 'Pegar' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.locator('.swal2-toast')).toContainText('emprestado');

    await menu(page).getByRole('link', { name: 'Meus empréstimos' }).click();
    const campoMeus = page.getByPlaceholder('Buscar por equipamento');
    await expect(campoMeus).toHaveAttribute('placeholder', 'Buscar por equipamento'); // sem "pessoa": são só os dela
    await campoMeus.fill(equipamento.split(' ')[1]);
    await expect(page.getByRole('row', { name: new RegExp(equipamento) })).toBeVisible();
    await campoMeus.fill('nada-disso');
    await expect(page.getByText('Nenhum empréstimo encontrado.')).toBeVisible();
    await sair(page);

    // o administrador acha o mesmo empréstimo pelo nome da pessoa
    await entrarComoAdmin(page);
    await menu(page).getByRole('link', { name: 'Todos os empréstimos' }).click();
    const campoTodos = page.getByPlaceholder('Buscar por equipamento ou pessoa');
    await campoTodos.fill(nome);
    const linha = page.getByRole('row', { name: new RegExp(equipamento) });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText(nome);
    await expect(page.getByRole('row')).toHaveCount(2);
  });

  test('auditoria: busca por quem fez e filtra junto com a ação', async ({ page }) => {
    const equipamento = unico('Item Auditado');
    await entrarComoAdmin(page);
    await criarEquipamento(page, equipamento);
    await menu(page).getByRole('link', { name: 'Auditoria', exact: true }).click();

    const campo = page.getByPlaceholder('Buscar por pessoa ou número');
    await campo.fill('administrador');
    await expect(page.getByRole('row').filter({ hasText: equipamento }).first()).toBeVisible();

    await campo.fill('ninguem-com-este-nome-aqui');
    await expect(page.getByText('Nenhum registro encontrado.')).toBeVisible();
  });
});
