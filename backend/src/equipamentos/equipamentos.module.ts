import { Module } from '@nestjs/common';
import { ReservasModule } from '../reservas/reservas.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { EquipamentosController } from './equipamentos.controller';
import { EquipamentosRepository } from './equipamentos.repository';
import { EquipamentosService } from './equipamentos.service';

@Module({
  imports: [RelatoriosModule, ReservasModule],
  controllers: [EquipamentosController],
  providers: [EquipamentosService, EquipamentosRepository],
  exports: [EquipamentosRepository],
})
export class EquipamentosModule {}
