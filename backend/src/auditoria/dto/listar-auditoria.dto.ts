import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';

export class ListarAuditoriaDto extends PaginacaoDto {
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
