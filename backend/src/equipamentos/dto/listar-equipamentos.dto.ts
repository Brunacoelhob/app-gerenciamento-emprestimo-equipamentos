import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'notebook', description: 'Busca pelo nome (sem diferenciar maiúsculas).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}
