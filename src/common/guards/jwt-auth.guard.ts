import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ROTA_PUBLICA } from '../decorators/publica.decorator';

// Guard GLOBAL: exige um JWT válido em toda rota, exceto as marcadas com @Publica().
// "Seguro por padrão": uma rota nova esquecida fica protegida, não aberta.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [context.getHandler(), context.getClass()]);
    return publica ? true : super.canActivate(context);
  }

  // Troca a mensagem padrão do Passport (em inglês) por uma única, que não revela o motivo exato.
  handleRequest<TUsuario = unknown>(erro: unknown, usuario: TUsuario): TUsuario {
    if (erro || !usuario) {
      throw new UnauthorizedException('Token de autenticação ausente, inválido ou expirado.');
    }
    return usuario;
  }
}
