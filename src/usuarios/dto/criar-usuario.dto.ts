import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../../generated/prisma/enums';
import { aparar, normalizarEmail } from '../../common/utils/texto.util';
import { SenhaForte } from '../../common/validacao/senha-forte.decorator';

// Criação de usuário POR UM ADMIN (único caminho para criar outro administrador).
export class CriarUsuarioDto {
  @ApiProperty({ example: 'João Pereira', minLength: 2, maxLength: 100 })
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'O nome deve ser um texto.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
  nome: string;

  @ApiProperty({ example: 'joao.pereira@empresa.com', description: 'Vira minúsculo. É o login.' })
  @Transform(({ value }) => normalizarEmail(value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email: string;

  @SenhaForte()
  senha: string;

  @ApiPropertyOptional({ enum: Role, default: Role.USER })
  @IsOptional()
  @IsEnum(Role, { message: 'O papel deve ser USER ou ADMIN.' })
  role?: Role;
}
