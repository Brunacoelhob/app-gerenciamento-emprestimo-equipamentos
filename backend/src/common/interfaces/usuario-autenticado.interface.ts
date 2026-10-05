import { Role } from '../../../generated/prisma/enums';

// Formato de request.user, preenchido pelo JwtStrategy e lido via @CurrentUser()
export interface UsuarioAutenticado {
  id: number;
  role: Role;
}
