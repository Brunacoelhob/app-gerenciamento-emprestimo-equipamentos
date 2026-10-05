import { expect, Page } from '@playwright/test';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@exemplo.com',
  senha: process.env.E2E_ADMIN_SENHA ?? '',
};
export const menu = (page: Page) => page.getByRole('navigation', { name: 'Principal' });
export const MAILPIT = process.env.E2E_MAILPIT ?? '';
export const SENHA_PADRAO = 'SenhaE2E12345';

// Nome único por execução: os testes criam dados de verdade e não podem esbarrar uns nos outros
export const unico = (prefixo: string) =>
  `${prefixo} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emailUnico = (prefixo: string) => `${prefixo}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}@e2e.teste.com`;

export async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

export async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Empréstimo de Equipamentos' })).toBeVisible();
}

export async function entrarComoAdmin(page: Page) {
  if (!ADMIN.senha) throw new Error('Defina E2E_ADMIN_SENHA (e E2E_ADMIN_EMAIL) para rodar os testes de interface.');
  await entrar(page, ADMIN.email, ADMIN.senha);
}

/** Como administrador, cria uma conta de usuário comum pela tela de Usuários. */
export async function criarUsuario(page: Page, nome: string, email: string, senha = SENHA_PADRAO) {
  await menu(page).getByRole('link', { name: 'Usuários', exact: true }).click();
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('E-mail (será o login)').fill(email);
  await page.getByLabel('Senha inicial').fill(senha);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta de ${nome} criada`);
}

/** Como administrador, cadastra um equipamento pela tela de Equipamentos. */
export async function criarEquipamento(page: Page, nome: string, descricao = 'Criado pelo teste de interface') {
  await menu(page).getByRole('link', { name: 'Equipamentos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('Descrição (opcional)').fill(descricao);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toContainText('Equipamento cadastrado');
}

/** Procura a mensagem mais recente enviada a um e-mail na caixa de entrada de teste (Mailpit). */
export async function ultimoEmailPara(destinatario: string, assunto: string, tentativas = 20): Promise<string> {
  for (let i = 0; i < tentativas; i++) {
    const lista = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)).json()) as {
      messages?: { ID: string; Subject: string }[];
    };
    const achada = lista.messages?.find((m) => m.Subject === assunto);
    if (achada) {
      const completa = (await (await fetch(`${MAILPIT}/api/v1/message/${achada.ID}`)).json()) as { Text: string };
      return completa.Text;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`E-mail "${assunto}" para ${destinatario} não chegou ao Mailpit.`);
}

/** CPF válido (dígitos verificadores corretos) diferente a cada chamada: o CPF é único por conta. */
export function cpfAleatorio(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[8] = (base[8] + 1) % 10; // 111.111.111-11 e afins são inválidos
  const digito = (ds: number[]) => {
    const soma = ds.reduce((total, d, i) => total + d * (ds.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  const d2 = digito([...base, d1]);
  return [...base, d1, d2].join('');
}

/** PNG de verdade (2x2, vermelho), montado byte a byte: nada de base64 digitado à mão. */
export function pngValido(): Buffer {
  const tabela = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (dados: Buffer) => {
    let c = 0xffffffff;
    for (const b of dados) c = tabela[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc(corpo));
    return Buffer.concat([tam, corpo, soma]);
  };
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(2, 0); // largura
  cabecalho.writeUInt32BE(2, 4); // altura
  cabecalho[8] = 8; // 8 bits por canal
  cabecalho[9] = 2; // RGB
  const linha = Buffer.from([0, 255, 0, 0, 255, 0, 0]); // filtro 0 + 2 pixels vermelhos
  const pixels = Buffer.concat([linha, linha]);
  // zlib "armazenado" (sem compressão): suficiente e sem depender de módulos extras
  const zlib = Buffer.concat([Buffer.from([0x78, 0x01, 0x01]), Buffer.from([pixels.length & 0xff, pixels.length >> 8, ~pixels.length & 0xff, (~pixels.length >> 8) & 0xff]), pixels]);
  let a = 1;
  let b = 0;
  for (const byte of pixels) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', Buffer.concat([zlib, adler])),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}
