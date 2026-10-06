import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { ReservasController } from './reservas.controller';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

@Module({
  imports: [EmailModule],
  controllers: [ReservasController],
  providers: [ReservasService, ReservasRepository],
  exports: [ReservasService],
})
export class ReservasModule {}
