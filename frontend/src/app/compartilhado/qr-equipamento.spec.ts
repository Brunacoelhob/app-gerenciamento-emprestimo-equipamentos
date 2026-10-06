import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { QrEquipamento } from './qr-equipamento';

describe('QrEquipamento', () => {
  it('gera uma imagem de QR code e mostra o nome, o código e o endereço que ele abre', async () => {
    const fixture = TestBed.createComponent(QrEquipamento);
    fixture.componentRef.setInput('nome', 'Notebook Dell');
    fixture.componentRef.setInput('codigo', '9F3A1C7B2D40');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 50)); // a imagem é gerada de forma assíncrona
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.src).toMatch(/^data:image\/svg\+xml/);
    expect(img.alt).toContain('Notebook Dell');
    expect(el.textContent).toContain('9F3A1C7B2D40');
    expect(el.textContent).toContain('/equipamentos?busca=9F3A1C7B2D40');
  });
});
