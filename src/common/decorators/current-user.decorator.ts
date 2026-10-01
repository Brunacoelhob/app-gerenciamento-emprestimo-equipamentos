import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// Entrega o usuário autenticado (preenchido pelo JwtStrategy) direto no controller,
// para nunca confiar em um id de usuário enviado pelo cliente.
export const CurrentUser = createParamDecorator((_dados: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
  return contexto.switchToHttp().getRequest<Request & { user: UsuarioAutenticado }>().user;
});
