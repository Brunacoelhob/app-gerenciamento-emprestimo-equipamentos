import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { aparar, normalizarEmail } from '../../common/utils/texto.util';
import { SenhaForte } from '../../common/validacao/senha-forte.decorator';

// Cadastro PÚBLICO. Propositalmente NÃO tem o campo "role": toda conta nasce como USER.
// (Com forbidNonWhitelisted, quem enviar "role" recebe 400 em vez de ser ignorado em silêncio.)
// Para criar um administrador, só outro ADMIN, por POST /v1/usuarios.
export class RegistrarUsuarioDto {
  @ApiProperty({ example: 'Maria Silva', minLength: 2, maxLength: 100 })
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'O nome deve ser um texto.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
  nome: string;

  @ApiProperty({ example: 'maria.silva@empresa.com', description: 'Vira minúsculo. É o login.' })
  @Transform(({ value }) => normalizarEmail(value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email: string;

  @SenhaForte()
  senha: string;
}
