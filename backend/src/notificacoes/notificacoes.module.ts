import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesRepository } from './notificacoes.repository';
import { NotificacoesService } from './notificacoes.service';

@Module({
  imports: [EmailModule],
  controllers: [NotificacoesController],
  providers: [NotificacoesService, NotificacoesRepository],
})
export class NotificacoesModule {}
