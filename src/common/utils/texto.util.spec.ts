import { aparar, normalizarEmail } from './texto.util';

describe('normalizarEmail', () => {
  it('tira espaços e deixa minúsculo', () => {
    expect(normalizarEmail('  Ana.Souza@Empresa.COM ')).toBe('ana.souza@empresa.com');
  });

  it('deixa passar o que não é texto (a validação do DTO recusa depois)', () => {
    expect(normalizarEmail(undefined)).toBeUndefined();
    expect(normalizarEmail(42)).toBe(42);
  });
});

describe('aparar', () => {
  it('tira espaços das pontas sem mexer no meio nem nas maiúsculas', () => {
    expect(aparar('  Notebook  Dell ')).toBe('Notebook  Dell');
    expect(aparar(null)).toBeNull();
  });
});
