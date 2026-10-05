import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AcessibilidadeService, ZOOM_MAX, ZOOM_MIN } from './acessibilidade.service';

const CHAVE = 'emprestimos.acessibilidade';

function criar(salvo?: unknown) {
  localStorage.clear();
  if (salvo !== undefined) localStorage.setItem(CHAVE, JSON.stringify(salvo));
  TestBed.resetTestingModule();
  return TestBed.inject(AcessibilidadeService);
}

describe('AcessibilidadeService', () => {
  beforeEach(() => document.documentElement.removeAttribute('data-tema'));

  it('o tamanho do texto respeita os limites', () => {
    const s = criar();
    for (let i = 0; i < 20; i++) s.aumentar();
    expect(s.prefs().zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 20; i++) s.diminuir();
    expect(s.prefs().zoom).toBe(ZOOM_MIN);
  });

  it('cada opção vira um atributo no <html> e "restaurar" remove todos', () => {
    const s = criar();
    s.alterar('contraste', true);
    s.alterar('dislexia', true);
    s.alterar('daltonismo', true);
    s.alterar('semAnimacao', true);
    s.alternarTema();
    TestBed.tick();
    const html = document.documentElement;
    expect(html.getAttribute('data-contraste')).toBe('alto');
    expect(html.getAttribute('data-dislexia')).toBe('on');
    expect(html.getAttribute('data-daltonismo')).toBe('on');
    expect(html.getAttribute('data-animacao')).toBe('reduzida');
    expect(html.getAttribute('data-tema')).toMatch(/claro|escuro/);

    s.restaurar();
    TestBed.tick();
    for (const a of ['data-contraste', 'data-dislexia', 'data-daltonismo', 'data-animacao', 'data-tema']) {
      expect(html.hasAttribute(a)).toBe(false);
    }
  });

  it('guarda as escolhas e as lê de volta', () => {
    const s = criar();
    s.alterar('dislexia', true);
    TestBed.tick();
    expect(criar(JSON.parse(localStorage.getItem(CHAVE) as string)).prefs().dislexia).toBe(true);
  });

  it('preferências salvas de uma versão antiga não ligam o VLibras sozinhas', () => {
    const antigo = { tema: 'auto', zoom: 1, contraste: false, dislexia: false, daltonismo: false, semAnimacao: false, vlibras: true };
    expect(criar(antigo).prefs().vlibras).toBe(false);
  });

  it('ignora conteúdo salvo inválido', () => {
    localStorage.setItem(CHAVE, '{lixo');
    TestBed.resetTestingModule();
    expect(TestBed.inject(AcessibilidadeService).prefs().zoom).toBe(1);
  });
});
