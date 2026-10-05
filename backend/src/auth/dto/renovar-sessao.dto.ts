import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// Usado em /auth/renovar e /auth/sair.
export class RenovarSessaoDto {
  @ApiProperty({ description: 'O refresh token recebido no login.', example: 'q3Zr...' })
  @IsString({ message: 'O refresh token deve ser um texto.' })
  @MinLength(20, { message: 'Refresh token inválido.' })
  @MaxLength(200, { message: 'Refresh token inválido.' })
  refreshToken: string;
}
