import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../../generated/prisma/enums';

export class AtualizarUsuarioDto {
  @ApiPropertyOptional({ enum: Role, description: 'Promove a ADMIN ou rebaixa a USER.' })
  @IsOptional()
  @IsEnum(Role, { message: 'O papel deve ser USER ou ADMIN.' })
  role?: Role;

  @ApiPropertyOptional({ description: 'false desativa a conta e encerra todas as sessões dela.', example: false })
  @IsOptional()
  @IsBoolean({ message: 'O campo ativo deve ser verdadeiro ou falso.' })
  ativo?: boolean;
}
