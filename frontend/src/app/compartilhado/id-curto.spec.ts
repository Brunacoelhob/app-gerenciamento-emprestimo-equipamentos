import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IdCurto } from './id-curto';

function montar(valor: number | string) {
  const fixture = TestBed.createComponent(IdCurto);
  fixture.componentRef.setInput('valor', valor);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.id') as HTMLElement;
}

describe('IdCurto', () => {
  it('ID de até 5 caracteres aparece inteiro', () => {
    expect(montar(7).textContent).toBe('7');
    expect(montar(12345).textContent).toBe('12345');
  });

  it('ID maior mostra só os 5 primeiros caracteres, com "…" indicando o resto escondido', () => {
    expect(montar(123456).textContent).toBe('12345…');
    expect(montar('9F3A1C7B2D40').textContent).toBe('9F3A1…');
  });

  it('o ID completo continua no tooltip e no rótulo para leitores de tela', () => {
    const el = montar(1234567);
    expect(el.title).toBe('ID completo: 1234567');
    expect(el.getAttribute('aria-label')).toBe('ID 1234567');
  });
});
