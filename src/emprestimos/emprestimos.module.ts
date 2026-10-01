import { Module } from '@nestjs/common';
import { EmprestimosController } from './emprestimos.controller';
import { EmprestimosRepository } from './emprestimos.repository';
import { EmprestimosService } from './emprestimos.service';

@Module({
  controllers: [EmprestimosController],
  providers: [EmprestimosService, EmprestimosRepository],
})
export class EmprestimosModule {}
