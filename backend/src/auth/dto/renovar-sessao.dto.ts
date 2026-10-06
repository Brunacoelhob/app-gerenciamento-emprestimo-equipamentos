import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Usado em /auth/renovar e /auth/sair.
export class RenovarSessaoDto {
  @ApiPropertyOptional({
    description:
      'O refresh token. NAVEGADORES não enviam nada aqui: o token vai e volta no cookie HttpOnly. Só clientes que não são navegadores (com o cabeçalho X-Tipo-Cliente: api) o recebem no corpo e o enviam aqui.',
    example: 'q3Zr...',
  })
  @IsOptional()
  @IsString({ message: 'O refresh token deve ser um texto.' })
  @MinLength(20, { message: 'Refresh token inválido.' })
  @MaxLength(200, { message: 'Refresh token inválido.' })
  refreshToken?: string;
}
