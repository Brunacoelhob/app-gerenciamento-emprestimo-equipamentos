import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

// Resposta pública de um usuário. Não existe campo de senha nem de hash: nem por engano ele vaza.
export class UsuarioRespostaDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'Maria Silva' }) nome: string;
  @ApiProperty({ example: 'maria.silva@empresa.com' }) email: string;
  @ApiProperty({ enum: Role, example: Role.USER }) role: Role;
  @ApiProperty({ example: true, description: 'Conta desativada não consegue entrar nem usar tokens antigos.' })
  ativo: boolean;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) criadoEm: Date;
}
