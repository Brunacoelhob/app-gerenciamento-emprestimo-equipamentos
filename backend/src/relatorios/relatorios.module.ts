import { Module } from '@nestjs/common';
import { RelatoriosService } from './relatorios.service';

@Module({ providers: [RelatoriosService], exports: [RelatoriosService] })
export class RelatoriosModule {}
