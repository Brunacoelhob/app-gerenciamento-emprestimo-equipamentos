import { expect, test } from '@playwright/test';
import { cpfAleatorio, criarUsuario, emailUnico, pngValido, entrar, entrarComoAdmin, sair, SENHA_PADRAO, unico } from './ajudantes';

// Cria uma pessoa nova (para os testes não mexerem na conta do administrador) e entra com ela
async function entrarComoPessoaNova(page: import('@playwright/test').Page) {
  const nome = unico('Pessoa Perfil');
  const email = emailUnico('perfil');
  await entrarComoAdmin(page);
  await criarUsuario(page, nome, email);
  await sair(page);
  await entrar(page, email, SENHA_PADRAO);
  await page.getByRole('link', { name: 'Meu perfil' }).first().click();
  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
  return { nome, email };
}

test.describe('perfil', () => {
  test('escolhe um bichinho como avatar e a escolha aparece no menu', async ({ page }) => {
    await entrarComoPessoaNova(page);
    const gato = page.getByRole('button', { name: 'Gato' });
    await gato.click();
    await expect(page.getByRole('status')).toContainText('Foto atualizada');
    await expect(gato).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.lateral app-avatar img')).toHaveAttribute('src', /avatares\/gato\.svg/);

    await page.getByRole('button', { name: 'Remover foto' }).click();
    await expect(page.getByRole('status')).toContainText('Foto removida');
  });

  test('envia uma foto de verdade (reduzida no navegador) e a API a aceita', async ({ page }) => {
    await entrarComoPessoaNova(page);
    const png = pngValido();
    await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('status')).toContainText('Foto atualizada');
    await expect(page.locator('.lateral app-avatar img')).toHaveAttribute('src', /^data:image\//);
  });

  test('arquivo que não é imagem é recusado no navegador, antes de ir para a API', async ({ page }) => {
    await entrarComoPessoaNova(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'texto.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
    await expect(page.getByRole('alert')).toContainText('PNG, JPEG ou WEBP');
  });

  test('dados pessoais: máscaras, CPF inválido barrado, CPF válido salvo e o CEP preenche o endereço', async ({ page }) => {
    await entrarComoPessoaNova(page);

    await page.getByLabel('CPF').fill('11111111111');
    await page.getByLabel('Telefone').fill('11987654321');
    await expect(page.getByLabel('CPF')).toHaveValue('111.111.111-11');
    await expect(page.getByLabel('Telefone')).toHaveValue('(11) 98765-4321');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('CPF inválido.')).toBeVisible();

    const cpf = cpfAleatorio();
    await page.getByLabel('CPF').fill(cpf);
    await page.getByLabel('Número').fill('1578');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('status')).toContainText('Perfil atualizado');

    // recarrega: os dados continuam lá, formatados
    await page.reload();
    await expect(page.getByLabel('CPF')).toHaveValue(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
    await expect(page.getByLabel('Número')).toHaveValue('1578');
  });

  test('"baixar meus dados" entrega um JSON com o perfil e sem a senha', async ({ page }) => {
    const { email } = await entrarComoPessoaNova(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar meus dados' }).click()]);
    expect(download.suggestedFilename()).toBe('meus-dados.json');
    const caminho = await download.path();
    const conteudo = (await import('node:fs')).readFileSync(caminho, 'utf8');
    expect(JSON.parse(conteudo).perfil.email).toBe(email);
    expect(conteudo).not.toMatch(/senhaHash|\$2[aby]\$/);
  });

  test('excluir a conta: pede a senha, apaga a pessoa e volta ao login sem deixá-la entrar de novo', async ({ page }) => {
    const { email } = await entrarComoPessoaNova(page);
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();

    const janela = page.getByRole('dialog');
    await janela.getByLabel('Digite a sua senha para confirmar').fill('senha-errada-123');
    await janela.getByRole('button', { name: 'Excluir definitivamente' }).click();
    await expect(janela.getByRole('alert')).toContainText('A senha está incorreta');

    await janela.getByLabel('Digite a sua senha para confirmar').fill(SENHA_PADRAO);
    await janela.getByRole('button', { name: 'Excluir definitivamente' }).click();
    await expect(page).toHaveURL(/\/login\?aviso=conta-excluida/);
    await expect(page.getByRole('status')).toContainText('conta foi excluída');

    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciais inválidas');
  });

  test('trocar a senha pelo perfil encerra a sessão e a nova senha entra', async ({ page }) => {
    const { email } = await entrarComoPessoaNova(page);
    await page.getByLabel('Senha atual').fill(SENHA_PADRAO);
    await page.getByLabel('Nova senha', { exact: true }).fill('SenhaTrocada789');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await entrar(page, email, 'SenhaTrocada789');
  });
});
