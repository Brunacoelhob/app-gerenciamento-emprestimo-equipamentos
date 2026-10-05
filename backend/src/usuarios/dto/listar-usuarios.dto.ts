import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '../../../generated/prisma/enums';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';

// Converte "true"/"false" da query string em booleano (o resto vira erro de validação, não é ignorado).
export const paraBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListarUsuariosDto extends PaginacaoDto {
  @ApiPropertyOptional({
    example: 'maria',
    description: 'Busca por parte do nome ou do e-mail (sem diferenciar maiúsculas).',
  })
  @IsOptional()
  @IsString({ message: 'A busca deve ser um texto.' })
  @MaxLength(120, { message: 'A busca deve ter no máximo 120 caracteres.' })
  busca?: string;

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
