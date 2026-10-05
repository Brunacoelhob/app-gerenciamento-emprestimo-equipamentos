import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../../generated/prisma/enums';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';

// Converte "true"/"false" da query string em booleano (o resto vira erro de validação, não é ignorado).
export const paraBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListarUsuariosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'O papel deve ser USER ou ADMIN.' })
  role?: Role;

  @ApiPropertyOptional({ example: true, description: 'Filtra contas ativas (true) ou desativadas (false).' })
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean({ message: 'O filtro ativo deve ser true ou false.' })
  ativo?: boolean;
}
