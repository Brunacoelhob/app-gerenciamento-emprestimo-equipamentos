import { intervalo, montarPagina } from './pagina';

describe('paginação', () => {
  it('calcula skip e take a partir de página e limite', () => {
    expect(intervalo({ pagina: 1, limite: 20 })).toEqual({ skip: 0, take: 20 });
    expect(intervalo({ pagina: 3, limite: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('monta os metadados, arredondando o total de páginas para cima', () => {
    expect(montarPagina(['a'], 25, { pagina: 1, limite: 10 }).meta).toEqual({
      total: 25,
      pagina: 1,
      limite: 10,
      totalPaginas: 3,
    });
    expect(montarPagina([], 20, { pagina: 1, limite: 10 }).meta.totalPaginas).toBe(2);
  });

  it('lista vazia ainda tem 1 página (nunca 0)', () => {
    expect(montarPagina([], 0, { pagina: 1, limite: 20 }).meta).toEqual({
      total: 0,
      pagina: 1,
      limite: 20,
      totalPaginas: 1,
    });
  });
});
