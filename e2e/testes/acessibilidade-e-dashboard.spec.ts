import { expect, test } from './base';
import { entrarComoAdmin, menu } from './ajudantes';

const html = (page: import('@playwright/test').Page) => page.locator('html');
const barra = (page: import('@playwright/test').Page) => page.getByRole('toolbar', { name: 'Acessibilidade' });
type Pagina = import('@playwright/test').Page;
const botaoDaltonismo = (page: Pagina) => barra(page).getByRole('button', { name: /^Daltonismo/ });
const TIPOS = { protanopia: 'Protanopia', deuteranopia: 'Deuteranopia', tritanopia: 'Tritanopia', acromatopsia: 'Acromatopsia', nenhum: 'Nenhum' };
async function escolherDaltonismo(page: Pagina, tipo: keyof typeof TIPOS) {
  await botaoDaltonismo(page).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^\\s*${TIPOS[tipo]}`) }).click();
}
async function tipoMarcado(page: Pagina) {
  await botaoDaltonismo(page).click();
  const marcado = await page.getByRole('menuitemradio', { checked: true }).innerText();
  await page.keyboard.press('Escape');
  return marcado.replace('✓', '').trim().split(' ')[0].toLowerCase();
}

test.describe('barra de acessibilidade', () => {
  test('está no topo do login, com os botões lado a lado e o seletor de daltonismo (e sem botão de Libras)', async ({ page }) => {
    await page.goto('/login');
    const b = barra(page);
    for (const nome of ['Diminuir o texto', 'Aumentar o texto', 'Contraste', 'Modo escuro', 'Dislexia', 'Sem animação']) {
      await expect(b.getByRole('button', { name: new RegExp(nome) })).toBeVisible();
    }
    await expect(botaoDaltonismo(page)).toBeVisible();
    await expect(b.getByRole('button', { name: /Libras/ })).toHaveCount(0); // o VLibras fica no canto direito da tela
  });

  test('FICA FIXA no topo: continua visível e no mesmo lugar depois de rolar a página', async ({ page }) => {
    await entrarComoAdmin(page);
    await page.getByLabel('Período').first().selectOption({ label: 'Últimos 90 dias' }).catch(() => undefined);
    // Garante uma página alta o bastante para rolar, mesmo que o dashboard tenha pouco conteúdo
    await page.evaluate(() => (document.body.style.minHeight = '4000px'));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const caixa = await barra(page).boundingBox();
    expect(caixa?.y).toBe(0);
    await expect(barra(page).getByRole('button', { name: 'Aumentar o texto' })).toBeInViewport();
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
    await escolherDaltonismo(page, 'tritanopia');
    await b.getByRole('button', { name: /Sem animação/ }).click();
    await b.getByRole('button', { name: /Modo escuro/ }).click();

    await expect(html(page)).toHaveAttribute('data-contraste', 'alto');
    await expect(html(page)).toHaveAttribute('data-dislexia', 'on');
    await expect(html(page)).toHaveAttribute('data-daltonismo', 'tritanopia');
    await expect(html(page)).toHaveAttribute('data-animacao', 'reduzida');
    await expect(html(page)).toHaveAttribute('data-tema', /claro|escuro/);

    await page.reload();
    await expect(html(page)).toHaveAttribute('data-contraste', 'alto');
    await expect(html(page)).toHaveAttribute('data-daltonismo', 'tritanopia');
    expect(await tipoMarcado(page)).toBe('tritanopia');
    await expect(b.getByRole('button', { name: /Contraste/ })).toHaveAttribute('aria-pressed', 'true');

    await b.getByRole('button', { name: 'Restaurar padrões de acessibilidade' }).click();
    for (const a of ['data-contraste', 'data-dislexia', 'data-daltonismo', 'data-animacao', 'data-tema']) {
      await expect(html(page)).not.toHaveAttribute(a, /.*/);
    }
    expect(await tipoMarcado(page)).toBe('nenhum');
  });

  test('cada tipo de daltonismo troca a paleta: as cores de "sucesso" e "erro" mudam e os status ganham símbolos', async ({ page }) => {
    await page.goto('/login');
    const cores = () =>
      html(page).evaluate((e) => {
        const c = getComputedStyle(e);
        return `${c.getPropertyValue('--sucesso').trim()}|${c.getPropertyValue('--erro').trim()}|${c.getPropertyValue('--grafico-1').trim()}`;
      });

    const paletas = new Map<string, string>();
    paletas.set('nenhum', await cores());
    for (const tipo of ['protanopia', 'deuteranopia', 'tritanopia', 'acromatopsia']) {
      await escolherDaltonismo(page, tipo as keyof typeof TIPOS);
      await expect(html(page)).toHaveAttribute('data-daltonismo', tipo);
      paletas.set(tipo, await cores());
    }
    // vermelho-verde compartilham a paleta; os demais são diferentes entre si e do padrão
    expect(paletas.get('protanopia')).toBe(paletas.get('deuteranopia'));
    expect(new Set([paletas.get('nenhum'), paletas.get('protanopia'), paletas.get('tritanopia'), paletas.get('acromatopsia')]).size).toBe(4);
  });

  test('o daltonismo é um botão compacto com um menu: "Nenhum" e os quatro tipos juntos; Esc e clique fora fecham', async ({ page }) => {
    await page.goto('/login');
    const botao = botaoDaltonismo(page);
    // compacto: o botão mostra só "Daltonismo", sem ocupar espaço com o valor escolhido
    const caixa = await botao.boundingBox();
    expect(caixa!.width).toBeLessThan(160);

    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    const itens = page.getByRole('menuitemradio');
    await expect(itens).toHaveCount(5);
    await expect(itens).toHaveText([/Nenhum/, /Protanopia/, /Deuteranopia/, /Tritanopia/, /Acromatopsia/]);
    await expect(page.getByRole('menuitemradio', { checked: true })).toContainText('Nenhum');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(botao).toBeFocused();

    await botao.click();
    await page.getByRole('heading', { name: 'Equipment loan' }).click(); // fora do menu
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('escolher um tipo destaca o botão e a escolha por teclado (setas e Enter) funciona', async ({ page }) => {
    await page.goto('/login');
    const botao = botaoDaltonismo(page);
    await expect(botao).not.toHaveClass(/ativo/);

    await botao.focus();
    await page.keyboard.press('Enter'); // abre; o foco vai para o item marcado ("Nenhum")
    await expect(page.getByRole('menuitemradio', { checked: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // Deuteranopia
    await page.keyboard.press('Enter');
    await expect(html(page)).toHaveAttribute('data-daltonismo', 'deuteranopia');
    await expect(botao).toHaveClass(/ativo/);
    await expect(botao).toHaveAttribute('aria-label', /Deuteranopia/);

    await escolherDaltonismo(page, 'nenhum');
    await expect(html(page)).not.toHaveAttribute('data-daltonismo', /.*/);
    await expect(botao).not.toHaveClass(/ativo/);
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

  test('o VLibras aparece no canto direito da tela (como nos sites do governo) e abre o painel de tradução', async ({ page }) => {
    test.skip(!!process.env.E2E_SEM_INTERNET, 'Precisa de internet (vlibras.gov.br).');
    await page.goto('/login');
    // o plugin monta o ícone num <div> solto no body, com Shadow DOM
    const posicao = () =>
      page.evaluate(() => {
        const botao = [...document.body.children].map((e) => e.shadowRoot?.querySelector('button')).find(Boolean);
        if (!botao) return null;
        const r = botao.getBoundingClientRect();
        return r.width > 0 ? { direita: window.innerWidth - r.right, centroY: r.top + r.height / 2, altura: window.innerHeight } : null;
      });
    await expect.poll(posicao, { timeout: 20_000 }).not.toBeNull();
    const p = (await posicao())!;
    expect(p.direita).toBeLessThan(60); // colado na borda direita
    expect(p.centroY).toBeGreaterThan(p.altura * 0.2); // no meio da lateral, não no topo
    expect(p.centroY).toBeLessThan(p.altura * 0.8);

    // clicar abre o painel de tradução
    await page.evaluate(() => [...document.body.children].map((e) => e.shadowRoot?.querySelector('button')).find(Boolean)?.click());
    await expect
      .poll(() => page.evaluate(() => [...document.body.children].some((e) => e.shadowRoot?.querySelector('div.fixed'))), { timeout: 20_000 })
      .toBe(true);
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
