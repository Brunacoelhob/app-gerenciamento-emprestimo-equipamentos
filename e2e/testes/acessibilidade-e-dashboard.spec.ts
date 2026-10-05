import { expect, test } from '@playwright/test';
import { entrarComoAdmin, menu } from './ajudantes';

const html = (page: import('@playwright/test').Page) => page.locator('html');
const barra = (page: import('@playwright/test').Page) => page.getByRole('toolbar', { name: 'Acessibilidade' });

test.describe('barra de acessibilidade', () => {
  test('está no topo do login, com todos os botões lado a lado', async ({ page }) => {
    await page.goto('/login');
    const b = barra(page);
    for (const nome of ['Diminuir o texto', 'Aumentar o texto', 'Contraste', 'Modo escuro', 'Dislexia', 'Daltonismo', 'Sem animação', 'Libras']) {
      await expect(b.getByRole('button', { name: new RegExp(nome) })).toBeVisible();
    }
  });

  test('aumentar e diminuir o texto muda o tamanho da fonte e respeita o limite', async ({ page }) => {
    await page.goto('/login');
    const tamanho = async () => Number.parseFloat(await html(page).evaluate((e) => getComputedStyle(e).fontSize));
    const inicial = await tamanho();
    await barra(page).getByRole('button', { name: 'Aumentar o texto' }).click();
    await expect.poll(tamanho).toBeGreaterThan(inicial);
    for (let i = 0; i < 10; i++) await barra(page).getByRole('button', { name: 'Aumentar o texto' }).click({ force: true });
    await expect(barra(page).getByRole('button', { name: 'Aumentar o texto' })).toBeDisabled();
    await barra(page).getByRole('button', { name: 'Diminuir o texto' }).click();
    await expect.poll(tamanho).toBeLessThan(inicial * 1.6);
  });

  test('contraste, tema escuro, dislexia, daltonismo e animação mudam o <html> e ficam salvos ao recarregar', async ({ page }) => {
    await page.goto('/login');
    const b = barra(page);
    await b.getByRole('button', { name: /Contraste/ }).click();
    await b.getByRole('button', { name: /Dislexia/ }).click();
    await b.getByRole('button', { name: /Daltonismo/ }).click();
    await b.getByRole('button', { name: /Sem animação/ }).click();
    await b.getByRole('button', { name: /Modo escuro/ }).click();

    await expect(html(page)).toHaveAttribute('data-contraste', 'alto');
    await expect(html(page)).toHaveAttribute('data-dislexia', 'on');
    await expect(html(page)).toHaveAttribute('data-daltonismo', 'on');
    await expect(html(page)).toHaveAttribute('data-animacao', 'reduzida');
    await expect(html(page)).toHaveAttribute('data-tema', /claro|escuro/);

    await page.reload();
    await expect(html(page)).toHaveAttribute('data-contraste', 'alto');
    await expect(b.getByRole('button', { name: /Contraste/ })).toHaveAttribute('aria-pressed', 'true');

    await b.getByRole('button', { name: 'Restaurar padrões de acessibilidade' }).click();
    for (const a of ['data-contraste', 'data-dislexia', 'data-daltonismo', 'data-animacao', 'data-tema']) {
      await expect(html(page)).not.toHaveAttribute(a, /.*/);
    }
  });

  test('a fonte para dislexia é carregada de verdade (OpenDyslexic), não só pedida', async ({ page }) => {
    await page.goto('/login');
    await barra(page).getByRole('button', { name: /Dislexia/ }).click();
    const carregada = await page.evaluate(async () => {
      await document.fonts.load('16px OpenDyslexic');
      return [...document.fonts].some((f) => f.family.includes('OpenDyslexic') && f.status === 'loaded');
    });
    expect(carregada).toBe(true);
  });

  test('o botão Libras liga o VLibras (o painel do governo aparece) e desliga', async ({ page }) => {
    test.skip(!!process.env.E2E_SEM_INTERNET, 'Precisa de internet (vlibras.gov.br).');
    await page.goto('/login');
    const libras = barra(page).getByRole('button', { name: /Libras/ });
    await libras.click();
    await expect(libras).toHaveAttribute('aria-pressed', 'true');
    // o plugin monta a interface num <div> solto no body, com Shadow DOM
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.body.children].some((e) => e.shadowRoot?.querySelector('div.fixed') && getComputedStyle(e).display !== 'none'),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await libras.click();
    await expect(libras).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('dashboard', () => {
  test('mostra os 8 indicadores e os gráficos', async ({ page }) => {
    await entrarComoAdmin(page);
    await expect(page.locator('.kpi')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Movimentação diária' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Situação do acervo' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Retiradas e devoluções por dia/ })).toBeVisible();
  });

  test('cada card abre uma janela explicando o número, que fecha com Esc', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.locator('.kpi').first().click();
    const janela = page.getByRole('dialog');
    await expect(janela).toBeVisible();
    await expect(janela).toContainText('O que significa');
    await expect(janela).toContainText('Como é calculado');
    await page.keyboard.press('Escape');
    await expect(janela).toBeHidden();
  });

  test('o botão "i" de cada gráfico explica como ler', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.getByRole('button', { name: 'Como ler o gráfico Movimentação diária' }).click();
    await expect(page.getByRole('dialog')).toContainText('Como ler');
    await page.getByRole('button', { name: 'Entendi' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('trocar o período recarrega os números e atualiza os rótulos', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.locator('select[name=periodo]').selectOption({ label: 'Últimos 7 dias' });
    await expect(page.getByText('Retiradas (7 dias)')).toBeVisible();
    await expect(page.getByRole('img', { name: /nos últimos 7 dias/ })).toBeVisible();
  });

  test('a tabela alternativa do gráfico traz um ponto por dia', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.locator('select[name=periodo]').selectOption({ label: 'Últimos 14 dias' });
    await page.getByText('Ver os dados em tabela').click();
    await expect(page.locator('app-grafico-linhas tbody tr')).toHaveCount(14);
  });

  test('o botão Voltar aparece nas páginas internas e leva de volta', async ({ page }) => {
    await entrarComoAdmin(page);
    await expect(page.getByRole('button', { name: 'Voltar' })).toHaveCount(0); // não existe no dashboard
    await menu(page).getByRole('link', { name: 'Equipamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
