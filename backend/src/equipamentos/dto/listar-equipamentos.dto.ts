import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { paraBooleano } from '../../usuarios/dto/listar-usuarios.dto';

export class ListarEquipamentosDto extends PaginacaoDto {
  @ApiPropertyOptional({ example: true, description: 'Equipamentos em uso (true) ou fora de uso (false).' })
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean({ message: 'O filtro ativo deve ser true ou false.' })
  ativo?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Só os emprestados (true) ou só os que não estão emprestados (false).',
  })
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean({ message: 'O filtro emprestado deve ser true ou false.' })
  emprestado?: boolean;

  @ApiPropertyOptional({
    example: 'notebook',
    description: 'Busca por parte do nome ou da descrição (sem diferenciar maiúsculas).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}

export class RelatorioEquipamentosDto extends ListarEquipamentosDto {
  @ApiPropertyOptional({ enum: ['pdf', 'xlsx', 'csv'], example: 'xlsx', description: 'Tipo do arquivo gerado.' })
  @IsIn(['pdf', 'xlsx', 'csv'], { message: 'O formato deve ser pdf, xlsx ou csv.' })
  formato: 'pdf' | 'xlsx' | 'csv';
}
