import { lerConfiguracao } from './variaveis';

const SEGREDO = 'um-segredo-forte-com-mais-de-trinta-e-dois-caracteres';
const base = { DATABASE_URL: 'postgresql://u:s@localhost:5432/banco', JWT_SECRET: SEGREDO };

describe('lerConfiguracao', () => {
  it('lê o mínimo necessário e aplica padrões seguros', () => {
    expect(lerConfiguracao(base)).toMatchObject({
      ambiente: 'development',
      porta: 3000,
      jwtExpiraEm: '15m', // token de acesso curto por padrão
      refreshDias: 7,
      bcryptCusto: 12,
      corsOrigens: [], // sem CORS liberado por padrão
      swaggerAtivo: true,
    });
  });

  it('exige DATABASE_URL e JWT_SECRET, com mensagem que diz qual falta', () => {
    expect(() => lerConfiguracao({ JWT_SECRET: SEGREDO })).toThrow('DATABASE_URL');
    expect(() => lerConfiguracao({ DATABASE_URL: base.DATABASE_URL })).toThrow('JWT_SECRET');
  });

  it('recusa JWT_SECRET curto ou o valor de exemplo', () => {
    expect(() => lerConfiguracao({ ...base, JWT_SECRET: 'curto' })).toThrow('32 caracteres');
    expect(() => lerConfiguracao({ ...base, JWT_SECRET: 'troque-por-uma-chave-aleatoria-longa-e-secreta' })).toThrow(
      'valor de exemplo',
    );
  });

  it('em produção o Swagger fica DESLIGADO, a menos que seja ligado de propósito', () => {
    expect(lerConfiguracao({ ...base, NODE_ENV: 'production' }).swaggerAtivo).toBe(false);
    expect(lerConfiguracao({ ...base, NODE_ENV: 'production', SWAGGER_ATIVO: 'true' }).swaggerAtivo).toBe(true);
    expect(lerConfiguracao({ ...base, NODE_ENV: 'development', SWAGGER_ATIVO: 'false' }).swaggerAtivo).toBe(false);
  });

  it('CORS_ORIGENS vira uma lista limpa', () => {
    expect(lerConfiguracao({ ...base, CORS_ORIGENS: ' https://a.com , https://b.com ,, ' }).corsOrigens).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('valida números e ambiente', () => {
    expect(() => lerConfiguracao({ ...base, PORT: 'abc' })).toThrow('PORT');
    expect(() => lerConfiguracao({ ...base, PORT: '70000' })).toThrow('PORT');
    expect(() => lerConfiguracao({ ...base, BCRYPT_CUSTO: '2' })).toThrow('BCRYPT_CUSTO');
    expect(() => lerConfiguracao({ ...base, REFRESH_DIAS: '0' })).toThrow('REFRESH_DIAS');
    expect(() => lerConfiguracao({ ...base, NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });
});
