import { defineConfig } from '@playwright/test';

// Os testes rodam contra uma aplicação JÁ no ar (interface + API + banco reais). Variáveis:
//   E2E_URL            endereço da interface (padrão http://localhost:4725; no Docker: http://127.0.0.1:8080)
//   E2E_ADMIN_EMAIL    e SENHA do administrador inicial
//   E2E_MAILPIT        endereço do Mailpit (caixa de entrada de teste); sem ele, os testes de e-mail são pulados
//   E2E_NAVEGADOR      "chrome" usa o Chrome instalado na máquina; vazio usa o Chromium do Playwright
//
// ATENÇÃO: a API precisa estar com limites de requisição altos (LIMITE_LOGIN_POR_MINUTO e LIMITE_GERAL_POR_MINUTO),
// senão o limite de 5 logins por minuto derruba a suíte. Nunca rode isto contra um ambiente de produção real: os
// testes criam contas e equipamentos.
export default defineConfig({
  testDir: './testes',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Em série: os testes compartilham o mesmo banco e alguns dependem de dados criados por outros
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:4725',
    channel: process.env.E2E_NAVEGADOR || undefined,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
