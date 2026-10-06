import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ConsentimentoService } from '../core/consentimento.service';
import { AvisoCookies } from './aviso-cookies';

function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AvisoCookies);
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  const botao = (nome: string) =>
    Array.from(raiz.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === nome,
    ) as HTMLButtonElement;
  return { fixture, raiz, botao, consentimento: TestBed.inject(ConsentimentoService) };
}

describe('AvisoCookies', () => {
  it('pergunta sempre, com três caminhos: aceitar, recusar e configurar', () => {
    const { raiz, botao } = montar();
    expect(raiz.querySelector('[role=dialog]')).not.toBeNull();
    expect(botao('Aceitar')).toBeTruthy();
    expect(botao('Recusar')).toBeTruthy();
    expect(botao('Configurar')).toBeTruthy();
  });

  it('aceitar libera os cookies funcionais e os serviços de terceiros e some', () => {
    const { fixture, raiz, botao, consentimento } = montar();
    botao('Aceitar').click();
    fixture.detectChanges();
    expect(consentimento.funcionais()).toBe(true);
    expect(consentimento.terceiros()).toBe(true);
    expect(raiz.querySelector('[role=dialog]')).toBeNull();
  });

  it('recusar deixa só os necessários', () => {
    const { fixture, botao, consentimento } = montar();
    botao('Recusar').click();
    fixture.detectChanges();
    expect(consentimento.funcionais()).toBe(false);
    expect(consentimento.terceiros()).toBe(false);
    expect(consentimento.decidido()).toBe(true);
  });

  it('configurar permite escolher cada categoria; os necessários ficam travados', () => {
    const { fixture, raiz, botao, consentimento } = montar();
    botao('Configurar').click();
    fixture.detectChanges();
    const caixas = Array.from(raiz.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[];
    expect(caixas).toHaveLength(3);
    expect(caixas[0].disabled).toBe(true);
    caixas[2].click(); // desliga os serviços de terceiros
    fixture.detectChanges();
    botao('Salvar escolhas').click();
    expect(consentimento.funcionais()).toBe(true);
    expect(consentimento.terceiros()).toBe(false);
  });
});
