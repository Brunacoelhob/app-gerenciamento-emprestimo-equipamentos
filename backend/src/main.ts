import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function iniciar() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  configurarApp(app);

  // Documentação interativa em /docs. Em produção fica desligada (a menos que SWAGGER_ATIVO=true).
  if (config.getOrThrow<boolean>('swaggerAtivo')) {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Equipment loan')
        .setDescription('API de empréstimo de equipamentos: autenticação, usuários, equipamentos e empréstimos.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, documento);
  }

  app.enableShutdownHooks(); // encerra conexões do banco com elegância quando o container recebe SIGTERM
  const porta = config.getOrThrow<number>('porta');
  await app.listen(porta, '0.0.0.0');
  new Logger('Bootstrap').log(`API no ar na porta ${porta} (${config.getOrThrow<string>('ambiente')})`);
}

void iniciar();
