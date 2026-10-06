import { Global, Module } from '@nestjs/common';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaInterceptor } from './auditar.decorator';
import { AuditoriaService } from './auditoria.service';

// Global: qualquer módulo pode usar @Auditar() ou injetar o AuditoriaService sem importar este módulo.
@Global()
@Module({
  imports: [RelatoriosModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService, AuditoriaInterceptor],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
