import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ConsultarDashboardDto {
  @ApiPropertyOptional({ description: 'Período analisado, em dias (7 a 90).', default: 30, minimum: 7, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O período deve ser um número inteiro de dias.' })
  @Min(7, { message: 'O período mínimo é 7 dias.' })
  @Max(90, { message: 'O período máximo é 90 dias.' })
  dias: number = 30;
}
