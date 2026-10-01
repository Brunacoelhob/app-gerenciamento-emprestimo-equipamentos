import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

export const PRAZO_PADRAO_DIAS = 7;
export const PRAZO_MAXIMO_DIAS = 30;

export class CriarEmprestimoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'O equipamentoId deve ser um número inteiro.' })
  @IsPositive({ message: 'O equipamentoId deve ser um número positivo.' })
  equipamentoId: number;

  @ApiPropertyOptional({
    example: 7,
    default: PRAZO_PADRAO_DIAS,
    minimum: 1,
    maximum: PRAZO_MAXIMO_DIAS,
    description:
      'Por quantos dias o equipamento fica com você. Passou disso e sem devolver, o empréstimo fica atrasado.',
  })
  @IsOptional()
  @IsInt({ message: 'O prazo deve ser um número inteiro de dias.' })
  @Min(1, { message: 'O prazo mínimo é 1 dia.' })
  @Max(PRAZO_MAXIMO_DIAS, { message: `O prazo máximo é ${PRAZO_MAXIMO_DIAS} dias.` })
  dias?: number;
}
