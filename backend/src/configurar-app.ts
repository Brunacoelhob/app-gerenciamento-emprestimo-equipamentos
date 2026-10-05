import { BadRequestException, ValidationError, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LogRequisicaoInterceptor } from './common/interceptors/log-requisicao.interceptor';

// Configuração HTTP compartilhada entre a API real (main.ts) e os testes e2e:
// assim os testes exercitam exatamente o mesmo prefixo, versão, validação e cabeçalhos de segurança.
export function configurarApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);

  app.disable('x-powered-by');

  // Atrás de um proxy reverso (nginx), o IP "de verdade" vem no X-Forwarded-For. Sem isso todo mundo teria o IP do
  // proxy e dividiria o mesmo limite de tentativas de login. Só se confia nos N proxies informados em TRUST_PROXY:
  // com 0 (padrão) o cabeçalho é ignorado e ninguém consegue forjar o próprio IP.
  const proxies = config.getOrThrow<number>('trustProxy');
  if (proxies > 0) app.set('trust proxy', proxies);
  app.use(helmet()); // cabeçalhos de segurança HTTP (CSP, X-Frame-Options, HSTS...)

  // Versionamento na URL: /v1/equipamentos. Uma v2 futura convive com a v1 sem quebrar quem a usa.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS por lista: só as origens de CORS_ORIGENS. Sem a variável, nenhum site de navegador é liberado.
  const origens = config.getOrThrow<string[]>('corsOrigens');
  app.enableCors({ origin: origens.length > 0 ? origens : false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos desconhecidos...
      forbidNonWhitelisted: true, // ...e recusa a requisição que os enviar (ex.: "role" no cadastro)
      transform: true, // converte tipos da query string e do corpo
      // Mensagens em português, uma por problema. O aviso padrão de campo proibido vem em inglês.
      exceptionFactory: (erros: ValidationError[]) =>
        new BadRequestException(
          erros.flatMap((erro) =>
            Object.entries(erro.constraints ?? {}).map(([regra, mensagem]) =>
              regra === 'whitelistValidation' ? `O campo "${erro.property}" não é permitido.` : mensagem,
            ),
          ),
        ),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LogRequisicaoInterceptor());
}
