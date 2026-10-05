import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [SessoesModule, EmailModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosRepository, UsuariosService],
})
export class UsuariosModule {}
