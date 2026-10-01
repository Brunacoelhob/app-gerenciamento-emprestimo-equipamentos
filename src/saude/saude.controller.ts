import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Publica } from '../common/decorators/publica.decorator';
import { PrismaService } from '../prisma/prisma.service';

export class SaudeRespostaDto {
  @ApiProperty({ example: 'ok' }) status: string;
  @ApiProperty({ example: 'ok', description: 'Resultado de um SELECT 1 no banco.' }) banco: string;
  @ApiProperty({ example: 3725, description: 'Segundos desde que a API foi iniciada.' }) uptimeSegundos: number;
}

const INICIO = Date.now();

// Fora da versão (/saude, não /v1/saude): é usada pelo Docker e por monitores, que não devem depender de versão.
@ApiTags('Saúde')
@Controller({ path: 'saude', version: VERSION_NEUTRAL })
export class SaudeController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Confere se a API e o banco estão no ar (pública, sem limite de requisições)' })
  @ApiOkResponse({ type: SaudeRespostaDto })
  @ApiServiceUnavailableResponse({ description: 'A API está no ar, mas o banco não respondeu.' })
  @Publica()
  @SkipThrottle()
  @Get()
  async verificar(): Promise<SaudeRespostaDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('O banco de dados não respondeu.');
    }
    return { status: 'ok', banco: 'ok', uptimeSegundos: Math.round((Date.now() - INICIO) / 1000) };
  }
}
