import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';

// Os filtros valem tanto para a listagem da tela quanto para o relatório (PDF, Excel, CSV).
export class FiltroAuditoriaDto {
  @ApiPropertyOptional({
    example: 'maria',
    description:
      'Busca por parte do nome de quem fez a ação. Um número procura também o registro afetado (ex.: usuário nº 12).',
  })
  @IsOptional()
  @IsString({ message: 'A busca deve ser um texto.' })
  @MaxLength(120, { message: 'A busca deve ter no máximo 120 caracteres.' })
  busca?: string;

  @ApiPropertyOptional({ example: 'PAPEL_ALTERADO', description: 'Só os registros desta ação.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  acao?: string;

  @ApiPropertyOptional({ example: 1, description: 'Só o que esta pessoa fez.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O atorId deve ser um número inteiro.' })
  @IsPositive({ message: 'O atorId deve ser positivo.' })
  atorId?: number;
}

export class ListarAuditoriaDto extends IntersectionType(PaginacaoDto, FiltroAuditoriaDto) {}

export const FORMATOS_RELATORIO = ['pdf', 'xlsx', 'csv'] as const;

export class FormatoRelatorioDto {
  @ApiProperty({ enum: FORMATOS_RELATORIO, example: 'xlsx', description: 'Tipo do arquivo gerado.' })
  @IsIn(FORMATOS_RELATORIO, { message: 'O formato deve ser pdf, xlsx ou csv.' })
  formato: (typeof FORMATOS_RELATORIO)[number];
}

export class RelatorioAuditoriaDto extends IntersectionType(FormatoRelatorioDto, FiltroAuditoriaDto) {}
