import { registerDecorator, ValidationOptions } from 'class-validator';
import { avatarValido, cpfValido } from '../utils/perfil.util';

// Validadores de campos de perfil. Valores vazios (null/undefined) ficam por conta de @IsOptional().

export function CpfValido(opcoes?: ValidationOptions) {
  return (objeto: object, propriedade: string) =>
    registerDecorator({
      name: 'cpfValido',
      target: objeto.constructor,
      propertyName: propriedade,
      options: { message: 'Informe um CPF válido.', ...opcoes },
      validator: { validate: (valor: unknown) => typeof valor === 'string' && cpfValido(valor) },
    });
}

export function AvatarValido(opcoes?: ValidationOptions) {
  return (objeto: object, propriedade: string) =>
    registerDecorator({
      name: 'avatarValido',
      target: objeto.constructor,
      propertyName: propriedade,
      options: {
        message: 'Avatar inválido: use um item do acervo ou uma imagem PNG, JPEG ou WEBP pequena.',
        ...opcoes,
      },
      validator: { validate: (valor: unknown) => typeof valor === 'string' && avatarValido(valor) },
    });
}
