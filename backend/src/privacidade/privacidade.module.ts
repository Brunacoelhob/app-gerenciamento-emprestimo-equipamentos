import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PrivacidadeController } from './privacidade.controller';
import { PrivacidadeRepository } from './privacidade.repository';
import { PrivacidadeService } from './privacidade.service';

@Module({
  imports: [UsuariosModule, EmailModule],
  controllers: [PrivacidadeController],
  providers: [PrivacidadeService, PrivacidadeRepository],
})
export class PrivacidadeModule {}
