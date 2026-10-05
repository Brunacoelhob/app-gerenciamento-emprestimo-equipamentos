import { ApiProperty } from '@nestjs/swagger';

export class TokensRespostaDto {
  @ApiProperty({
    description: 'JWT de vida curta (padrão 15 minutos). Vai no cabeçalho Authorization: Bearer.',
    example: 'eyJhbGciOi...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Token de renovação (padrão 7 dias, uso único: a cada renovação vem um novo).',
    example: 'q3Zr...',
  })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer' })
  tipo: 'Bearer';

  @ApiProperty({ description: 'Quando o accessToken expira.', example: '2026-10-01T12:15:00.000Z' })
  accessTokenExpiraEm: Date;
}
