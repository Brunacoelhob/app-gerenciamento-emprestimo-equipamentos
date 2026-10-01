import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Parâmetros de paginação comuns a todas as listagens (?pagina=2&limite=20).
export class PaginacaoDto {
  @ApiPropertyOptional({ description: 'Número da página (começa em 1).', default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser no mínimo 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({
    description: 'Itens por página (1 a 100).',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O limite deve ser um número inteiro.' })
  @Min(1, { message: 'O limite deve ser no mínimo 1.' })
  @Max(100, { message: 'O limite deve ser no máximo 100.' })
  limite: number = 20;
}
