import { SetMetadata } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

// Marca quais roles podem acessar a rota; o RolesGuard le essa metadata
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
