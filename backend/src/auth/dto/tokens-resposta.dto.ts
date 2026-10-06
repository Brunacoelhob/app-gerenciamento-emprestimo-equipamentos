import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokensRespostaDto {
  @ApiProperty({
    description: 'JWT de vida curta (padrão 15 minutos). Vai no cabeçalho Authorization: Bearer.',
    example: 'eyJhbGciOi...',
  })
  accessToken: string;

  @ApiPropertyOptional({
    description:
      'Token de renovação (padrão 7 dias, uso único). Para NAVEGADORES ele NÃO vem aqui: vai no cookie HttpOnly `emp_sessao`. Só aparece para clientes que mandam o cabeçalho X-Tipo-Cliente: api.',
    example: 'q3Zr...',
  })
  refreshToken?: string;

  @ApiProperty({ example: 'Bearer' })
  tipo: 'Bearer';

  @ApiProperty({ description: 'Quando o accessToken expira.', example: '2026-10-01T12:15:00.000Z' })
  accessTokenExpiraEm: Date;
}

// O que o serviço sempre produz (com o refresh token). O controlador decide se ele vai no corpo ou só no cookie.
export type TokensCompletos = TokensRespostaDto & { refreshToken: string };
