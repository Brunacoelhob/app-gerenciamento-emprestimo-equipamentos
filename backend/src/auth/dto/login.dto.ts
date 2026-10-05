import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizarEmail } from '../../common/utils/texto.util';

export class LoginDto {
  @ApiProperty({ example: 'maria.silva@empresa.com' })
  @Transform(({ value }) => normalizarEmail(value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  // No login não se revela a política de senha; o limite máximo evita gastar CPU do bcrypt com textos gigantes.
  @ApiProperty({ example: 'Senha1234' })
  @IsString({ message: 'A senha deve ser um texto.' })
  @MinLength(1, { message: 'Informe a senha.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  senha: string;
}
