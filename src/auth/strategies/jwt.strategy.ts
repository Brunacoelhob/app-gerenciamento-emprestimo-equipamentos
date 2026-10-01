import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UsuarioAutenticado } from '../../common/interfaces/usuario-autenticado.interface';
import { UsuariosRepository } from '../../usuarios/usuarios.repository';

// Valida o JWT (assinatura e validade) e monta o request.user.
// O papel e a situação da conta vêm do BANCO, a cada requisição: se o admin desativar uma conta ou
// mudar um papel, o efeito é imediato, mesmo com um token ainda dentro da validade.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usuarios: UsuariosRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwtSecret'),
      algorithms: ['HS256'], // só o algoritmo esperado: fecha a porta para ataques de troca de algoritmo
    });
  }

  async validate(payload: { sub: number }): Promise<UsuarioAutenticado> {
    const usuario = await this.usuarios.buscarAutenticacao(payload.sub);
    if (!usuario || !usuario.ativo)
      throw new UnauthorizedException('Token de autenticação ausente, inválido ou expirado.');
    return { id: usuario.id, role: usuario.role };
  }
}
