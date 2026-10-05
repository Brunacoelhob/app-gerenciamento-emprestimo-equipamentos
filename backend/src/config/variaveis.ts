// Validação das variáveis de ambiente na partida: a aplicação não sobe com configuração insegura ou incompleta.

export interface Configuracao {
  ambiente: 'development' | 'test' | 'production';
  porta: number;
  databaseUrl: string;
  jwtSecret: string;
  /** Duração do token de acesso (curto, de propósito). Ex.: 15m */
  jwtExpiraEm: string;
  /** Validade do refresh token, em dias. */
  refreshDias: number;
  /** Custo do bcrypt: maior = mais seguro e mais lento. */
  bcryptCusto: number;
  /** Origens liberadas no CORS. Vazio = nenhuma origem de navegador. */
  corsOrigens: string[];
  swaggerAtivo: boolean;
}

const SEGREDOS_FRACOS = ['troque-por-uma-chave-aleatoria-longa-e-secreta', 'changeme', 'secret', 'senha'];

function inteiro(valor: string | undefined, padrao: number, nome: string, minimo: number, maximo: number): number {
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < minimo || n > maximo) {
    throw new Error(`Variável ${nome} inválida: use um número inteiro de ${minimo} a ${maximo} (recebido "${valor}").`);
  }
  return n;
}

export function lerConfiguracao(env: Record<string, unknown> = process.env): Configuracao {
  const texto = (nome: string) => (typeof env[nome] === 'string' ? env[nome].trim() : '');

  const databaseUrl = texto('DATABASE_URL');
  if (!databaseUrl) throw new Error('Variável de ambiente obrigatória ausente: DATABASE_URL. Veja o .env.example.');

  const jwtSecret = texto('JWT_SECRET');
  if (!jwtSecret) throw new Error('Variável de ambiente obrigatória ausente: JWT_SECRET. Veja o .env.example.');
  if (jwtSecret.length < 32 || SEGREDOS_FRACOS.includes(jwtSecret.toLowerCase())) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres e não pode ser o valor de exemplo.');
  }

  const ambiente = (texto('NODE_ENV') || 'development') as Configuracao['ambiente'];
  if (!['development', 'test', 'production'].includes(ambiente)) {
    throw new Error(`NODE_ENV inválido: "${ambiente}". Use development, test ou production.`);
  }

  return {
    ambiente,
    porta: inteiro(texto('PORT'), 3000, 'PORT', 1, 65535),
    databaseUrl,
    jwtSecret,
    jwtExpiraEm: texto('JWT_EXPIRA_EM') || '15m',
    refreshDias: inteiro(texto('REFRESH_DIAS'), 7, 'REFRESH_DIAS', 1, 90),
    bcryptCusto: inteiro(texto('BCRYPT_CUSTO'), 12, 'BCRYPT_CUSTO', 4, 15),
    corsOrigens: texto('CORS_ORIGENS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    // Em produção o Swagger fica desligado, a menos que seja ligado de propósito.
    swaggerAtivo: texto('SWAGGER_ATIVO') ? texto('SWAGGER_ATIVO') === 'true' : ambiente !== 'production',
  };
}
