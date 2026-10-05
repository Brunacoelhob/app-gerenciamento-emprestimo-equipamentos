import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizarEmail } from '../../common/utils/texto.util';
import { SenhaForte } from '../../common/validacao/senha-forte.decorator';

export class EsqueciSenhaDto {
  @ApiProperty({ example: 'maria.silva@empresa.com' })
  @Transform(({ value }) => normalizarEmail(value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email: string;
}

export class RedefinirSenhaDto {
  @ApiProperty({ description: 'O código que veio no link do e-mail.', example: 'q3Zr...' })
  @IsString({ message: 'O código deve ser um texto.' })
  @MinLength(20, { message: 'Link inválido.' })
  @MaxLength(200, { message: 'Link inválido.' })
  token: string;

  @SenhaForte('NovaSenha5678')
  novaSenha: string;
}
