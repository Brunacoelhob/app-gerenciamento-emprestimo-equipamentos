import { Module } from '@nestjs/common';
import { MetricasController } from './metricas.controller';
import { MetricasService } from './metricas.service';
import { SaudeController } from './saude.controller';

@Module({
  controllers: [SaudeController, MetricasController],
  providers: [MetricasService],
  exports: [MetricasService],
})
export class SaudeModule {}
