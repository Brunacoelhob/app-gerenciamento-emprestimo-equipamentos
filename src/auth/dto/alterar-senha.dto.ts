import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SenhaForte } from '../../common/validacao/senha-forte.decorator';

export class AlterarSenhaDto {
  @ApiProperty({ example: 'Senha1234', description: 'A senha atual, para confirmar que é você.' })
  @IsString({ message: 'A senha atual deve ser um texto.' })
  @MinLength(1, { message: 'Informe a senha atual.' })
  @MaxLength(72, { message: 'A senha atual deve ter no máximo 72 caracteres.' })
  senhaAtual: string;

  @SenhaForte('NovaSenha5678')
  novaSenha: string;
}
