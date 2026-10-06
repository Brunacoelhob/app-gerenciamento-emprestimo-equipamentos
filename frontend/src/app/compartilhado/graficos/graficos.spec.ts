import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GraficoBarras } from './grafico-barras';
import { GraficoLinhas } from './grafico-linhas';
import { GraficoRosca } from './grafico-rosca';

function montar<T>(tipo: new () => T, entradas: Record<string, unknown>) {
  const fixture = TestBed.createComponent(tipo);
  for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('GraficoRosca', () => {
  it('mostra número e percentual de cada fatia na legenda (a cor não é a única pista)', () => {
    const el = montar(GraficoRosca, {
      fatias: [
        { rotulo: 'Disponíveis', valor: 6, cor: 'red' },
        { rotulo: 'Emprestados', valor: 12, cor: 'blue' },
        { rotulo: 'Desativados', valor: 2, cor: 'gray' },
      ],
    });
    const linhas = [...el.querySelectorAll('.legenda li')].map((li) =>
      [...li.children]
        .map((c) => c.textContent?.trim())
        .filter(Boolean)
        .join(' '),
    );
    expect(linhas).toEqual(['Disponíveis 6 30%', 'Emprestados 12 60%', 'Desativados 2 10%']);
    expect(el.querySelector('.numero')?.textContent).toBe('20');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toContain('12 emprestados');
  });

  it('com tudo zerado não desenha fatias nem divide por zero', () => {
    const el = montar(GraficoRosca, { fatias: [{ rotulo: 'Disponíveis', valor: 0, cor: 'red' }] });
    expect(el.querySelectorAll('.fatia')).toHaveLength(0);
    expect(el.querySelector('.pct')?.textContent).toBe('0%');
  });
});

describe('GraficoLinhas', () => {
  const pontos = Array.from({ length: 30 }, (_, i) => ({
    rotulo: `${String(i + 1).padStart(2, '0')}/09`,
    a: i % 6,
    b: (i + 2) % 5,
  }));

  it('arredonda o eixo para cima em 4 faixas inteiras e traça as duas séries', () => {
    const el = montar(GraficoLinhas, { pontos, nomeA: 'Retiradas', nomeB: 'Devoluções' });
    const marcas = [...el.querySelectorAll('text.eixo[text-anchor="end"]')].map(
      (t) => t.textContent,
    );
    // maior valor = 5 -> eixo até 8, em 4 faixas inteiras
    expect(marcas).toEqual(['0', '2', '4', '6', '8']);
    expect(el.querySelector('.linha-a')?.getAttribute('d')).toMatch(/^M/);
    expect(el.querySelector('.linha-b')?.getAttribute('d')).toMatch(/^M/);
  });

  it('inclui o primeiro e o último dia no eixo e uma tabela com todos os pontos', () => {
    const el = montar(GraficoLinhas, { pontos, nomeA: 'Retiradas', nomeB: 'Devoluções' });
    const rotulos = [...el.querySelectorAll('text.eixo[text-anchor="middle"]')].map(
      (t) => t.textContent,
    );
    expect(rotulos[0]).toBe('01/09');
    expect(rotulos[rotulos.length - 1]).toBe('30/09');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(30);
  });

  it('a série B é tracejada (distinguível sem cor)', () => {
    const el = montar(GraficoLinhas, { pontos });
    expect(el.querySelector('.linha-b')).not.toBeNull();
    expect(el.querySelector('figcaption .marca-b')).not.toBeNull();
  });
});

describe('GraficoBarras', () => {
  it('a maior barra ocupa 100% e as outras são proporcionais', () => {
    const el = montar(GraficoBarras, {
      itens: [
        { nome: 'A', total: 8 },
        { nome: 'B', total: 2 },
      ],
    });
    const larguras = [...el.querySelectorAll<HTMLElement>('.barra')].map((b) => b.style.width);
    expect(larguras).toEqual(['100%', '25%']);
  });

  it('sem itens mostra a mensagem de vazio', () => {
    const el = montar(GraficoBarras, { itens: [], vazio: 'Nada por aqui.' });
    expect(el.textContent).toContain('Nada por aqui.');
    expect(el.querySelector('ol')).toBeNull();
  });
});
