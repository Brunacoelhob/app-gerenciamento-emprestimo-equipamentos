import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { Publica } from '../common/decorators/publica.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MetricasService } from './metricas.service';

// Métricas para monitoramento (formato Prometheus). Fora da versão, como /saude. Protegida por um token próprio
// (METRICAS_TOKEN): sem o token configurado a rota nem existe (404); com ele, só quem o apresenta lê os números.
@ApiExcludeController()
@Controller({ path: 'metricas', version: VERSION_NEUTRAL })
export class MetricasController {
  constructor(
    private readonly metricas: MetricasService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Publica() // a autenticação é a do token de métricas, não a de usuário
  @SkipThrottle()
  @Get()
  async ler(
    @Headers('authorization') autorizacao: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const esperado = this.config.getOrThrow<string>('metricasToken');
    if (!esperado) throw new NotFoundException();

    const recebido = autorizacao?.replace(/^Bearer\s+/i, '') ?? '';
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    // Comparação em tempo constante: o tempo de resposta não revela quantos caracteres do token estavam certos
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Token de métricas inválido.');

    let ativo = true;
    const indicadores: Record<string, number> = {};
    try {
      const agora = new Date();
      const [equipamentos, ativos, atrasados, filas, usuarios] = await Promise.all([
        this.prisma.equipamento.count({ where: { ativo: true } }),
        this.prisma.emprestimo.count({ where: { status: 'ATIVO' } }),
        this.prisma.emprestimo.count({ where: { status: 'ATIVO', prazoDevolucao: { lt: agora } } }),
        this.prisma.reserva.count({ where: { status: 'AGUARDANDO' } }),
        this.prisma.usuario.count({ where: { ativo: true } }),
      ]);
      Object.assign(indicadores, {
        equipamentos_ativos: equipamentos,
        emprestimos_ativos: ativos,
        emprestimos_atrasados: atrasados,
        filas_aguardando: filas,
        usuarios_ativos: usuarios,
      });
    } catch {
      ativo = false;
    }
    // Os cabeçalhos só valem para a resposta de sucesso: um erro continua sendo JSON
    res.set({ 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
    return this.metricas.exposicao({ ativo, indicadores });
  }
}
