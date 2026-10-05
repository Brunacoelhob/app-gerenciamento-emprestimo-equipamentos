import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { StatusEmprestimo } from '../../../generated/prisma/enums';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { paraBooleano } from '../../usuarios/dto/listar-usuarios.dto';

// Filtros que valem para "meus empréstimos" e para a listagem geral do ADMIN.
export class ListarMeusEmprestimosDto extends PaginacaoDto {
  @ApiPropertyOptional({
    enum: StatusEmprestimo,
    description: 'Um status inválido devolve 400 (não é ignorado em silêncio).',
  })
  @IsOptional()
  @IsEnum(StatusEmprestimo, { message: 'O status deve ser ATIVO ou DEVOLVIDO.' })
  status?: StatusEmprestimo;

  @ApiPropertyOptional({ example: true, description: 'Só os atrasados (ativos e com o prazo vencido).' })
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean({ message: 'O filtro atrasados deve ser true ou false.' })
  atrasados?: boolean;
}

// Somente ADMIN: pode filtrar por pessoa e por equipamento (o histórico de um equipamento sai daqui).
export class ListarEmprestimosDto extends ListarMeusEmprestimosDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O usuarioId deve ser um número inteiro.' })
  @IsPositive({ message: 'O usuarioId deve ser positivo.' })
  usuarioId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O equipamentoId deve ser um número inteiro.' })
  @IsPositive({ message: 'O equipamentoId deve ser positivo.' })
  equipamentoId?: number;
}
