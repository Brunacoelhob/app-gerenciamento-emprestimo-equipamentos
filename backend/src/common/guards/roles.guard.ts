import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// Guard GLOBAL de autorização: confere o papel quando a rota usa @Roles().
// Sem @Roles(), qualquer usuário autenticado passa.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!permitidos || permitidos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    if (!user || !permitidos.includes(user.role)) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso.');
    }
    return true;
  }
}
