import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_RENOVACOES = 2;
export const PRAZO_RENOVACAO_PADRAO_DIAS = 7;
export const PRAZO_RENOVACAO_MAX_DIAS = 14;

export class RenovarEmprestimoDto {
  @ApiPropertyOptional({
    example: 7,
    description: `Dias a somar ao prazo atual (1 a ${PRAZO_RENOVACAO_MAX_DIAS}, padrão ${PRAZO_RENOVACAO_PADRAO_DIAS}).`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Os dias devem ser um número inteiro.' })
  @Min(1, { message: 'Renove por pelo menos 1 dia.' })
  @Max(PRAZO_RENOVACAO_MAX_DIAS, { message: `Renove por no máximo ${PRAZO_RENOVACAO_MAX_DIAS} dias.` })
  dias?: number;
}
