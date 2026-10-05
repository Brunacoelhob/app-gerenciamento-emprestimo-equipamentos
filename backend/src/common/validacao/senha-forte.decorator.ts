import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Política de senha única para cadastro, criação por admin e troca de senha:
// 8 a 72 caracteres (72 é o limite real do bcrypt: o que passar disso seria ignorado), com letra e número.
export function SenhaForte(exemplo = 'Senha1234') {
  return applyDecorators(
    ApiProperty({
      example: exemplo,
      minLength: 8,
      maxLength: 72,
      description: '8 a 72 caracteres, com pelo menos uma letra e um número.',
    }),
    IsString({ message: 'A senha deve ser um texto.' }),
    MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' }),
    MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' }),
    Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'A senha deve ter pelo menos uma letra e um número.' }),
  );
}
