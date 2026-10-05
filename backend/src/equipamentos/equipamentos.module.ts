import { Module } from '@nestjs/common';
import { EquipamentosController } from './equipamentos.controller';
import { EquipamentosRepository } from './equipamentos.repository';
import { EquipamentosService } from './equipamentos.service';

@Module({
  controllers: [EquipamentosController],
  providers: [EquipamentosService, EquipamentosRepository],
  exports: [EquipamentosRepository],
})
export class EquipamentosModule {}
