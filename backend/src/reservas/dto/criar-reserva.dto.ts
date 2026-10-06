import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class CriarReservaDto {
  @ApiProperty({ example: 3, description: 'Equipamento que está emprestado e que a pessoa quer esperar.' })
  @Type(() => Number)
  @IsInt({ message: 'O equipamentoId deve ser um número inteiro.' })
  @IsPositive({ message: 'O equipamentoId deve ser positivo.' })
  equipamentoId: number;
}
