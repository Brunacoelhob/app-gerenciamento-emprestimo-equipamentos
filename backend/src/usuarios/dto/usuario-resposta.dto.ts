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
  @ApiProperty({ example: '52998224725', nullable: true, type: String }) cpf: string | null;
  @ApiProperty({ example: '11987654321', nullable: true, type: String }) telefone: string | null;
  @ApiProperty({ example: '01310100', nullable: true, type: String }) cep: string | null;
  @ApiProperty({ example: 'Avenida Paulista', nullable: true, type: String }) logradouro: string | null;
  @ApiProperty({ example: '1578', nullable: true, type: String }) numero: string | null;
  @ApiProperty({ example: 'Apto 12', nullable: true, type: String }) complemento: string | null;
  @ApiProperty({ example: 'Bela Vista', nullable: true, type: String }) bairro: string | null;
  @ApiProperty({ example: 'São Paulo', nullable: true, type: String }) cidade: string | null;
  @ApiProperty({ example: 'SP', nullable: true, type: String }) uf: string | null;
  @ApiProperty({ example: 'animal:gato', nullable: true, type: String }) avatar: string | null;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) criadoEm: Date;
}
