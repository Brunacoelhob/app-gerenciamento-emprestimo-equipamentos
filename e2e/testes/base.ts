import { expect, test as base } from '@playwright/test';

// O aviso de cookies aparece a cada carregamento da página (de propósito). Nos testes, ele é aceito sozinho, para não
// ficar na frente dos botões; o comportamento do aviso em si é testado em cookies.spec.ts, que usa o "test" puro.
export const test = base.extend({
  page: async ({ page }, use) => {
    const aceitar = page.getByRole('dialog', { name: 'Cookies e privacidade' }).getByRole('button', { name: 'Aceitar' });
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Cookies e privacidade' }), async () => {
      await aceitar.click();
    });
    const ir = page.goto.bind(page);
    page.goto = async (...args) => {
      const resposta = await ir(...args);
      await aceitar.click({ timeout: 4_000 }).catch(() => undefined);
      return resposta;
    };
    await use(page);
  },
});

export { expect };
