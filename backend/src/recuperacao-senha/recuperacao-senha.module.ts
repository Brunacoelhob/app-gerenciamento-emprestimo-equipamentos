import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { RecuperacaoSenhaController } from './recuperacao-senha.controller';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

@Module({
  imports: [UsuariosModule, SessoesModule, EmailModule],
  controllers: [RecuperacaoSenhaController],
  providers: [RecuperacaoSenhaService, RecuperacaoSenhaRepository],
})
export class RecuperacaoSenhaModule {}
