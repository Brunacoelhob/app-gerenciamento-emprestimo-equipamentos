import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AvatarValido, CpfValido } from '../../common/validacao/perfil.decorators';
import { apenasDigitos } from '../../common/utils/perfil.util';
import { aparar, normalizarEmail } from '../../common/utils/texto.util';

// Texto opcional: aparado, e "" vira null (apaga o campo). undefined = não mexe no campo.
const textoOuNulo = ({ value }: { value: unknown }) => {
  const texto = aparar(value);
  return texto === '' ? null : texto;
};
const digitosOuNulo = ({ value }: { value: unknown }) => {
  const digitos = apenasDigitos(value);
  return digitos === '' ? null : digitos;
};

// Edição do PRÓPRIO perfil. Não existe campo de papel nem de situação da conta.
export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @Transform(({ value }) => aparar(value))
  @IsString({ message: 'O nome deve ser um texto.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome deve ter no máximo 100 caracteres.' })
  nome?: string;

  @ApiPropertyOptional({ example: 'maria.silva@empresa.com', description: 'É o login. Vira minúsculo.' })
  @IsOptional()
  @Transform(({ value }) => normalizarEmail(value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  email?: string;

  @ApiPropertyOptional({ example: '52998224725', nullable: true, description: 'Só dígitos (a máscara é removida).' })
  @IsOptional()
  @Transform(digitosOuNulo)
  @CpfValido()
  cpf?: string | null;

  @ApiPropertyOptional({ example: '11987654321', nullable: true, description: 'DDD + número, 10 ou 11 dígitos.' })
  @IsOptional()
  @Transform(digitosOuNulo)
  @Matches(/^\d{10,11}$/, { message: 'Informe o telefone com DDD (10 ou 11 dígitos).' })
  telefone?: string | null;

  @ApiPropertyOptional({ example: '01310100', nullable: true })
  @IsOptional()
  @Transform(digitosOuNulo)
  @Matches(/^\d{8}$/, { message: 'O CEP deve ter 8 dígitos.' })
  cep?: string | null;

  @ApiPropertyOptional({ example: 'Avenida Paulista', nullable: true })
  @IsOptional()
  @Transform(textoOuNulo)
  @IsString({ message: 'O logradouro deve ser um texto.' })
  @MaxLength(150, { message: 'O logradouro deve ter no máximo 150 caracteres.' })
  logradouro?: string | null;

  @ApiPropertyOptional({ example: '1578', nullable: true })
  @IsOptional()
  @Transform(textoOuNulo)
  @IsString({ message: 'O número deve ser um texto.' })
  @MaxLength(20, { message: 'O número deve ter no máximo 20 caracteres.' })
  numero?: string | null;

  @ApiPropertyOptional({ example: 'Apto 12', nullable: true })
  @IsOptional()
  @Transform(textoOuNulo)
  @IsString({ message: 'O complemento deve ser um texto.' })
  @MaxLength(80, { message: 'O complemento deve ter no máximo 80 caracteres.' })
  complemento?: string | null;

  @ApiPropertyOptional({ example: 'Bela Vista', nullable: true })
  @IsOptional()
  @Transform(textoOuNulo)
  @IsString({ message: 'O bairro deve ser um texto.' })
  @MaxLength(80, { message: 'O bairro deve ter no máximo 80 caracteres.' })
  bairro?: string | null;

  @ApiPropertyOptional({ example: 'São Paulo', nullable: true })
  @IsOptional()
  @Transform(textoOuNulo)
  @IsString({ message: 'A cidade deve ser um texto.' })
  @MaxLength(80, { message: 'A cidade deve ter no máximo 80 caracteres.' })
  cidade?: string | null;

  @ApiPropertyOptional({ example: 'SP', nullable: true })
  @IsOptional()
  @Transform(({ value }) => {
    const texto = textoOuNulo({ value });
    return typeof texto === 'string' ? texto.toUpperCase() : texto;
  })
  @Matches(/^[A-Z]{2}$/, { message: 'A UF deve ter 2 letras.' })
  uf?: string | null;

  @ApiPropertyOptional({
    example: 'animal:gato',
    nullable: true,
    description: '"animal:<nome>" do acervo ou uma imagem PNG/JPEG/WEBP pequena em data URL. null remove.',
  })
  @IsOptional()
  @Transform(textoOuNulo)
  @AvatarValido()
  avatar?: string | null;
}
