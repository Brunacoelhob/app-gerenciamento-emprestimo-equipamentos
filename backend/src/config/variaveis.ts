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
  /** Quantos proxies reversos confiáveis existem na frente da API (0 = acesso direto). Define de onde sai o IP do cliente. */
  trustProxy: number;
  /** Endereço público da interface web: vai nos links dos e-mails (ex.: https://app.exemplo.com). */
  appUrl: string;
  /** Servidor SMTP para enviar e-mails. Vazio = nenhum: em desenvolvimento o e-mail só é escrito no log. */
  smtpHost: string;
  smtpPorta: number;
  /** true = TLS direto (porta 465); false = STARTTLS quando o servidor oferece (587). */
  smtpSeguro: boolean;
  smtpUsuario: string;
  smtpSenha: string;
  emailRemetente: string;
  /** Permite o cadastro aberto (POST /auth/registro). CADASTRO_PUBLICO=false desliga: só administradores criam contas. */
  cadastroPublico: boolean;
  /** O cookie da sessão só viaja por HTTPS. Padrão: ligado em produção. COOKIE_SEGURO=false só para testar produção em http local. */
  cookieSeguro: boolean;
  /** Liga a rotina diária de avisos por e-mail (vencimento e atraso). Ligada por padrão; NOTIFICACOES_ATIVAS=false desliga. */
  notificacoesAtivas: boolean;
  /** Quando a rotina roda (cron de 5 campos). Padrão: todo dia às 8h. */
  notificacoesCron: string;
  /** Fuso do horário acima. */
  notificacoesFuso: string;
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

// O endereço entra nos links dos e-mails (recuperação de senha): precisa ser http(s) e, em produção, informado de
// propósito. Um endereço padrão errado mandaria o link de redefinição para o lugar errado.
function lerAppUrl(valor: string, ambiente: Configuracao['ambiente']): string {
  if (!valor) {
    if (ambiente === 'production') {
      throw new Error('Variável de ambiente obrigatória ausente em produção: APP_URL (ex.: https://app.exemplo.com).');
    }
    return 'http://localhost:4200';
  }
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`APP_URL inválida: "${valor}". Use um endereço completo, como https://app.exemplo.com.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('APP_URL precisa começar com http:// ou https://.');
  return url.origin + url.pathname.replace(/\/+$/, '');
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
    trustProxy: inteiro(texto('TRUST_PROXY'), 0, 'TRUST_PROXY', 0, 5),
    appUrl: lerAppUrl(texto('APP_URL'), ambiente),
    smtpHost: texto('SMTP_HOST'),
    smtpPorta: inteiro(texto('SMTP_PORTA'), 587, 'SMTP_PORTA', 1, 65535),
    smtpSeguro: texto('SMTP_SEGURO') === 'true',
    smtpUsuario: texto('SMTP_USUARIO'),
    smtpSenha: texto('SMTP_SENHA'),
    cadastroPublico: texto('CADASTRO_PUBLICO') !== 'false',
    cookieSeguro: texto('COOKIE_SEGURO') ? texto('COOKIE_SEGURO') === 'true' : ambiente === 'production',
    notificacoesAtivas: texto('NOTIFICACOES_ATIVAS') !== 'false',
    notificacoesCron: texto('NOTIFICACOES_CRON') || '0 8 * * *',
    notificacoesFuso: texto('NOTIFICACOES_FUSO') || 'America/Sao_Paulo',
    emailRemetente: texto('EMAIL_REMETENTE') || 'Equipment loan <nao-responda@localhost>',
  };
}
