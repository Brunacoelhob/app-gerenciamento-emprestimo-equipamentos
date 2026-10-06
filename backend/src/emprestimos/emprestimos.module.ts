import { Module } from '@nestjs/common';
import { ReservasModule } from '../reservas/reservas.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { EmprestimosController } from './emprestimos.controller';
import { EmprestimosRepository } from './emprestimos.repository';
import { EmprestimosService } from './emprestimos.service';

@Module({
  imports: [RelatoriosModule, ReservasModule],
  controllers: [EmprestimosController],
  providers: [EmprestimosService, EmprestimosRepository],
})
export class EmprestimosModule {}
