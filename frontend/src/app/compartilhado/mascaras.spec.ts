import { describe, expect, it } from 'vitest';
import { cpfValido, mascaraCep, mascaraCpf, mascaraTelefone, soDigitos } from './mascaras';

describe('máscaras', () => {
  it('formata CPF, telefone e CEP enquanto a pessoa digita', () => {
    expect(mascaraCpf('5299')).toBe('529.9');
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25');
    expect(mascaraCpf('529982247259999')).toBe('529.982.247-25');
    expect(mascaraTelefone('11')).toBe('(11');
    expect(mascaraTelefone('1198765')).toBe('(11) 9876-5');
    expect(mascaraTelefone('1132345678')).toBe('(11) 3234-5678');
    expect(mascaraTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascaraCep('01310')).toBe('01310');
    expect(mascaraCep('01310100')).toBe('01310-100');
  });

  it('soDigitos remove tudo que não é número', () => {
    expect(soDigitos('(11) 98765-4321')).toBe('11987654321');
  });

  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});
