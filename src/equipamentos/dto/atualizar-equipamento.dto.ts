import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { aparar } from '../../common/utils/texto.util';

export class AtualizarEquipamentoDto {
  @ApiPropertyOptional({ example: 'Notebook Dell Latitude 5450', maxLength: 120 })
  @IsOptional()
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'O nome do equipamento deve ser um texto.' })
  @IsNotEmpty({ message: 'O nome não pode ficar vazio.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  nome?: string;

  @ApiPropertyOptional({ example: 'Trocou o carregador', maxLength: 500 })
  @IsOptional()
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'A descrição deve ser um texto.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  descricao?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'false tira o equipamento de uso. Não é permitido enquanto ele estiver emprestado.',
  })
  @IsOptional()
  @IsBoolean({ message: 'O campo ativo deve ser verdadeiro ou falso.' })
  ativo?: boolean;
}
