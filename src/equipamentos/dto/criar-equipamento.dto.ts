import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { aparar } from '../../common/utils/texto.util';

export class CriarEquipamentoDto {
  @ApiProperty({ example: 'Notebook Dell Latitude 5440', maxLength: 120 })
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'O nome do equipamento deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe o nome do equipamento.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  nome: string;

  @ApiPropertyOptional({ example: 'Notebook i5, 16GB RAM, para uso em campo', maxLength: 500 })
  @IsOptional()
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'A descrição deve ser um texto.' })
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  descricao?: string;
}
