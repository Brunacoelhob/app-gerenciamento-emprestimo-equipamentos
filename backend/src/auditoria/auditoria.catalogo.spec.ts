import { CATALOGO_ACOES, descreverDetalhes, detalhesEmTexto, infoDaAcao, rotuloDaEntidade } from './auditoria.catalogo';

describe('catálogo de ações da auditoria', () => {
  it('toda ação tem texto em português, categoria e marca de criticidade', () => {
    for (const [acao, info] of Object.entries(CATALOGO_ACOES)) {
      expect(info.rotulo.length).toBeGreaterThan(3);
      expect(['conta', 'acervo', 'emprestimo', 'seguranca']).toContain(info.categoria);
      expect(typeof info.critica).toBe('boolean');
      expect(acao).toMatch(/^[A-Z_]+$/);
    }
  });

  it('as ações que indicam risco são destacadas como críticas', () => {
    expect(infoDaAcao('SESSAO_REUTILIZADA').critica).toBe(true);
    expect(infoDaAcao('CONTA_DESATIVADA').critica).toBe(true);
    expect(infoDaAcao('PAPEL_ALTERADO').critica).toBe(true);
    expect(infoDaAcao('EQUIPAMENTO_CRIADO').critica).toBe(false);
  });

  it('ação desconhecida (de uma versão futura ou antiga) não quebra: aparece com o próprio nome', () => {
    expect(infoDaAcao('ACAO_NOVA').rotulo).toBe('ACAO_NOVA');
  });

  it('rótulos das entidades', () => {
    expect(rotuloDaEntidade('usuario')).toBe('Usuário');
    expect(rotuloDaEntidade('equipamento')).toBe('Equipamento');
    expect(rotuloDaEntidade('qualquer')).toBe('qualquer');
  });
});

describe('descreverDetalhes', () => {
  it('traduz papel, situação da conta e e-mail para linguagem legível', () => {
    expect(descreverDetalhes('usuario', { role: 'ADMIN', ativo: false, email: 'a@b.com' })).toEqual([
      { rotulo: 'Perfil', valor: 'Administrador' },
      { rotulo: 'Conta', valor: 'Desativada' },
      { rotulo: 'E-mail', valor: 'a@b.com' },
    ]);
  });

  it('"ativo" significa outra coisa para equipamento', () => {
    expect(descreverDetalhes('equipamento', { nome: 'Projetor', ativo: true })).toEqual([
      { rotulo: 'Nome', valor: 'Projetor' },
      { rotulo: 'Situação', valor: 'Em uso' },
    ]);
  });

  it('campos vazios somem e chaves desconhecidas não se perdem', () => {
    expect(descreverDetalhes('usuario', { role: undefined, ativo: null, nome: '', algo: 7, obj: { a: 1 } })).toEqual([
      { rotulo: 'algo', valor: '7' },
      { rotulo: 'obj', valor: '{"a":1}' },
    ]);
  });

  it('entrada inválida vira lista vazia', () => {
    for (const ruim of [null, undefined, 'texto', 42, [1, 2]]) expect(descreverDetalhes('usuario', ruim)).toEqual([]);
  });

  it('em texto corrido para os relatórios', () => {
    expect(detalhesEmTexto('usuario', { role: 'USER', email: 'x@y.com' })).toBe('Perfil: Usuário · E-mail: x@y.com');
    expect(detalhesEmTexto('usuario', null)).toBe('');
  });
});
