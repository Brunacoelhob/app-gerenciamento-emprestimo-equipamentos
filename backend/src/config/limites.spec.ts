import { lerLimite } from './limites';

describe('lerLimite', () => {
  it('sem a variável, vale o padrão', () => {
    expect(lerLimite('LIMITE', 5, {})).toBe(5);
    expect(lerLimite('LIMITE', 5, { LIMITE: '  ' })).toBe(5);
  });

  it('aceita um inteiro de 1 a 100000', () => {
    expect(lerLimite('LIMITE', 5, { LIMITE: '1000' })).toBe(1000);
  });

  it('recusa valores inválidos em vez de ignorá-los em silêncio', () => {
    for (const ruim of ['0', '-3', 'abc', '2.5', '100001']) {
      expect(() => lerLimite('LIMITE', 5, { LIMITE: ruim })).toThrow('LIMITE');
    }
  });
});
