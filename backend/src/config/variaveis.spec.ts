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
      trustProxy: 0, // sem proxy confiável: o cabeçalho X-Forwarded-For é ignorado
      smtpHost: '', // sem SMTP: em desenvolvimento o e-mail só vai para o log
      smtpPorta: 587,
      appUrl: 'http://localhost:4200',
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
    expect(lerConfiguracao({ ...base, NODE_ENV: 'production', APP_URL: 'https://app.exemplo.com' }).swaggerAtivo).toBe(
      false,
    );
    expect(
      lerConfiguracao({ ...base, NODE_ENV: 'production', APP_URL: 'https://app.exemplo.com', SWAGGER_ATIVO: 'true' })
        .swaggerAtivo,
    ).toBe(true);
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

  it('TRUST_PROXY aceita de 0 a 5 e recusa o resto', () => {
    expect(lerConfiguracao({ ...base, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(() => lerConfiguracao({ ...base, TRUST_PROXY: '-1' })).toThrow('TRUST_PROXY');
    expect(() => lerConfiguracao({ ...base, TRUST_PROXY: 'sim' })).toThrow('TRUST_PROXY');
  });

  it('APP_URL: aceita http(s), tira a barra final e é obrigatória em produção', () => {
    expect(lerConfiguracao({ ...base, APP_URL: 'https://app.exemplo.com/' }).appUrl).toBe('https://app.exemplo.com');
    expect(() => lerConfiguracao({ ...base, APP_URL: 'ftp://x.com' })).toThrow('APP_URL');
    expect(() => lerConfiguracao({ ...base, APP_URL: 'não é uma url' })).toThrow('APP_URL');
    expect(() => lerConfiguracao({ ...base, NODE_ENV: 'production' })).toThrow('APP_URL');
  });

  it('lê as variáveis de SMTP', () => {
    const c = lerConfiguracao({ ...base, SMTP_HOST: 'smtp.exemplo.com', SMTP_PORTA: '465', SMTP_SEGURO: 'true' });
    expect(c).toMatchObject({ smtpHost: 'smtp.exemplo.com', smtpPorta: 465, smtpSeguro: true });
    expect(() => lerConfiguracao({ ...base, SMTP_PORTA: '0' })).toThrow('SMTP_PORTA');
  });

  it('cookie Secure: ligado em produção, desligado fora dela, e pode ser decidido de propósito', () => {
    const producao = { ...base, NODE_ENV: 'production', APP_URL: 'https://app.exemplo.com' };
    expect(lerConfiguracao(base).cookieSeguro).toBe(false);
    expect(lerConfiguracao(producao).cookieSeguro).toBe(true);
    expect(lerConfiguracao({ ...producao, COOKIE_SEGURO: 'false' }).cookieSeguro).toBe(false);
    expect(lerConfiguracao({ ...base, COOKIE_SEGURO: 'true' }).cookieSeguro).toBe(true);
  });
});
