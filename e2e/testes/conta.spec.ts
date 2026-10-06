import { expect, test } from './base';
import { criarUsuario, emailUnico, entrar, entrarComoAdmin, MAILPIT, sair, SENHA_PADRAO, ultimoEmailPara, unico } from './ajudantes';

test.describe('recuperação de senha por e-mail', () => {
  test.skip(!MAILPIT, 'Defina E2E_MAILPIT para testar o envio de e-mails.');

  test('"esqueci minha senha": o link chega por e-mail, troca a senha uma vez só e a nova senha entra', async ({ page }) => {
    const nome = unico('Pessoa Esqueceu');
    const email = emailUnico('esqueceu');
    await entrarComoAdmin(page);
    await criarUsuario(page, nome, email);
    await sair(page);

    // pede o link (a tela responde igual para qualquer e-mail)
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();

    const texto = await ultimoEmailPara(email, 'Redefinição de senha');
    const link = /(http\S+\/redefinir-senha\?token=[\w-]+)/.exec(texto)?.[1];
    expect(link).toBeTruthy();

    // abre o link: o código sai do endereço e a nova senha é salva
    await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page).toHaveURL(/\/redefinir-senha$/);
    await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenhaE2E678');
    await page.getByLabel('Repita a nova senha').fill('NovaSenhaE2E678');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('heading', { name: 'Senha alterada' })).toBeVisible();

    // o mesmo link não funciona de novo
    await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''));
    await page.getByLabel('Nova senha', { exact: true }).fill('OutraSenhaE2E999');
    await page.getByLabel('Repita a nova senha').fill('OutraSenhaE2E999');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('heading', { name: 'Link inválido ou vencido' })).toBeVisible();

    // a senha antiga não entra; a nova entra
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciais inválidas');
    await entrar(page, email, 'NovaSenhaE2E678');

    // e a pessoa foi avisada da troca
    await ultimoEmailPara(email, 'Sua senha foi alterada');
  });

  test('e-mail desconhecido recebe a MESMA resposta (não revela quem tem conta)', async ({ page }) => {
    await page.goto('/esqueci-senha');
    await page.getByLabel('E-mail', { exact: true }).fill(emailUnico('ninguem'));
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();
  });

  test('link sem código ou com código inventado mostra "link inválido"', async ({ page }) => {
    await page.goto('/redefinir-senha');
    await expect(page.getByRole('heading', { name: 'Link inválido ou vencido' })).toBeVisible();

    await page.goto('/redefinir-senha?token=' + 'x'.repeat(43));
    await page.getByLabel('Nova senha', { exact: true }).fill('SenhaE2E12345');
    await page.getByLabel('Repita a nova senha').fill('SenhaE2E12345');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('heading', { name: 'Link inválido ou vencido' })).toBeVisible();
  });
});

test.describe('cadastro aberto', () => {
  test('a pessoa cria a própria conta, com validação de senha, e entra', async ({ page }) => {
    const email = emailUnico('cadastro');
    await page.goto('/login');
    await page.getByRole('link', { name: 'Criar conta' }).click();

    await page.getByLabel('Nome', { exact: true }).fill('Pessoa Cadastrada');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('curta');
    await page.getByLabel('Repita a senha').fill('outra');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Pelo menos 8 caracteres')).toBeVisible();
    await expect(page.getByText('As senhas não são iguais.')).toBeVisible();

    await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
    await page.getByLabel('Repita a senha').fill(SENHA_PADRAO);
    // sem o aceite da política, a conta não é criada
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('É preciso aceitar a Política de Privacidade')).toBeVisible();
    await page.getByLabel(/Li e concordo/).check();
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible();

    await page.getByRole('link', { name: 'Ir para o login' }).click();
    await entrar(page, email, SENHA_PADRAO);
  });

  test('e-mail repetido é recusado com mensagem clara', async ({ page }) => {
    const email = emailUnico('repetido');
    for (const esperado of ['Conta criada', 'Já existe um usuário com esse e-mail']) {
      await page.goto('/registro');
      await page.getByLabel('Nome', { exact: true }).fill('Quem Repete');
      await page.getByLabel('E-mail', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
      await page.getByLabel('Repita a senha').fill(SENHA_PADRAO);
      await page.getByLabel(/Li e concordo/).check();
      await page.getByRole('button', { name: 'Criar conta' }).click();
      await expect(page.getByText(esperado)).toBeVisible();
    }
  });
});
