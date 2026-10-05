import { mascararCpf, mascararTelefone, minimizarParaAdmin } from './mascara.util';

describe('mascara de dados pessoais', () => {
  it('CPF mostra só os dois últimos dígitos', () => {
    expect(mascararCpf('52998224725')).toBe('***.***.***-25');
    expect(mascararCpf(null)).toBeNull();
    expect(mascararCpf('123')).toBe('***'); // formato inesperado: não vaza
  });

  it('telefone mostra só o DDD e os quatro últimos dígitos', () => {
    expect(mascararTelefone('11987654321')).toBe('(11) *****-4321');
    expect(mascararTelefone('1132345678')).toBe('(11) *****-5678');
    expect(mascararTelefone(null)).toBeNull();
    expect(mascararTelefone('123')).toBe('***');
  });

  it('para o administrador, tira o endereço de rua e mantém o que não identifica (nome, e-mail, cidade)', () => {
    const r = minimizarParaAdmin({
      nome: 'Maria',
      email: 'maria@teste.com',
      cidade: 'Recife',
      uf: 'PE',
      cpf: '52998224725',
      telefone: '81987654321',
      cep: '50010000',
      logradouro: 'Rua A',
      numero: '10',
      complemento: 'ap 2',
      bairro: 'Centro',
    });
    expect(r).toMatchObject({
      nome: 'Maria',
      cidade: 'Recife',
      uf: 'PE',
      cpf: '***.***.***-25',
      telefone: '(81) *****-4321',
    });
    expect([r.cep, r.logradouro, r.numero, r.complemento, r.bairro]).toEqual([null, null, null, null, null]);
  });
});
