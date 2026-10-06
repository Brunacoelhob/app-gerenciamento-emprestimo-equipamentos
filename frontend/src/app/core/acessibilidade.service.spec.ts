import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConsentimentoService } from './consentimento.service';
import {
  AcessibilidadeService,
  TIPOS_DALTONISMO,
  ZOOM_MAX,
  ZOOM_MIN,
} from './acessibilidade.service';

const CHAVE = 'emprestimos.acessibilidade';

function criar(salvo?: unknown) {
  localStorage.clear();
  if (salvo !== undefined) localStorage.setItem(CHAVE, JSON.stringify(salvo));
  TestBed.resetTestingModule();
  return TestBed.inject(AcessibilidadeService);
}

describe('AcessibilidadeService', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-tema');
    document.documentElement.removeAttribute('data-daltonismo');
    document.getElementById('vlibras-raiz')?.remove();
    document.querySelectorAll('script[src*="vlibras"]').forEach((s) => s.remove());
  });

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
    s.alterar('daltonismo', 'tritanopia');
    s.alterar('semAnimacao', true);
    s.alternarTema();
    TestBed.tick();
    const html = document.documentElement;
    expect(html.getAttribute('data-contraste')).toBe('alto');
    expect(html.getAttribute('data-dislexia')).toBe('on');
    expect(html.getAttribute('data-daltonismo')).toBe('tritanopia');
    expect(html.getAttribute('data-animacao')).toBe('reduzida');
    expect(html.getAttribute('data-tema')).toMatch(/claro|escuro/);

    s.restaurar();
    TestBed.tick();
    for (const a of [
      'data-contraste',
      'data-dislexia',
      'data-daltonismo',
      'data-animacao',
      'data-tema',
    ]) {
      expect(html.hasAttribute(a)).toBe(false);
    }
  });

  it('cada tipo de daltonismo do seletor vira o valor do atributo; "nenhum" remove o atributo', () => {
    const s = criar();
    for (const { valor } of TIPOS_DALTONISMO) {
      s.alterar('daltonismo', valor);
      TestBed.tick();
      if (valor === 'nenhum')
        expect(document.documentElement.hasAttribute('data-daltonismo')).toBe(false);
      else expect(document.documentElement.getAttribute('data-daltonismo')).toBe(valor);
    }
    expect(TIPOS_DALTONISMO.map((t) => t.valor)).toEqual([
      'nenhum',
      'protanopia',
      'deuteranopia',
      'tritanopia',
      'acromatopsia',
    ]);
  });

  it('guarda as escolhas e as lê de volta', () => {
    const s = criar();
    TestBed.inject(ConsentimentoService).aceitarTodos();
    s.alterar('dislexia', true);
    s.alterar('daltonismo', 'acromatopsia');
    TestBed.tick();
    const lido = criar(JSON.parse(localStorage.getItem(CHAVE) as string)).prefs();
    expect(lido.dislexia).toBe(true);
    expect(lido.daltonismo).toBe('acromatopsia');
  });

  it('preferência de uma versão antiga (daltonismo ligado/desligado) é convertida; valor inválido vira "nenhum"', () => {
    expect(criar({ daltonismo: true }).prefs().daltonismo).toBe('deuteranopia');
    expect(criar({ daltonismo: false }).prefs().daltonismo).toBe('nenhum');
    expect(criar({ daltonismo: 'tipo-que-nao-existe' }).prefs().daltonismo).toBe('nenhum');
  });

  it('ignora conteúdo salvo inválido', () => {
    localStorage.setItem(CHAVE, '{lixo');
    TestBed.resetTestingModule();
    expect(TestBed.inject(AcessibilidadeService).prefs().zoom).toBe(1);
  });

  it('o VLibras só é carregado com a permissão da pessoa, e uma única vez', () => {
    criar();
    TestBed.tick();
    expect(document.getElementById('vlibras-raiz')).toBeNull(); // antes de aceitar, nada de serviço externo

    TestBed.inject(ConsentimentoService).aceitarTodos();
    TestBed.tick();
    expect(document.getElementById('vlibras-raiz')).not.toBeNull();
    expect(document.querySelectorAll('script[src*="vlibras.gov.br"]')).toHaveLength(1);
    TestBed.resetTestingModule();
    TestBed.inject(AcessibilidadeService).alterar('zoom', 1.2);
    TestBed.inject(ConsentimentoService).aceitarTodos();
    TestBed.tick();
    expect(document.querySelectorAll('#vlibras-raiz')).toHaveLength(1);
    expect(document.querySelectorAll('script[src*="vlibras.gov.br"]')).toHaveLength(1);
  });

  it('recusar os cookies não guarda as preferências nem carrega o VLibras', () => {
    const s = criar({ dislexia: true });
    TestBed.inject(ConsentimentoService).recusar();
    s.alterar('contraste', true);
    TestBed.tick();
    expect(localStorage.getItem(CHAVE)).toBeNull();
    expect(document.getElementById('vlibras-raiz')).toBeNull();
  });
});
