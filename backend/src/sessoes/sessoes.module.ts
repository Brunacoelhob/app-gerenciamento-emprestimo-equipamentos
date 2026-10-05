import { Module } from '@nestjs/common';
import { SessoesRepository } from './sessoes.repository';

// Módulo próprio para os módulos de autenticação e de usuários compartilharem as sessões sem dependência circular.
@Module({ providers: [SessoesRepository], exports: [SessoesRepository] })
export class SessoesModule {}
