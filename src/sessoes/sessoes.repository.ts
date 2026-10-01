import { Injectable } from '@nestjs/common';
import { RefreshToken } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Acesso aos refresh tokens (sessões renováveis). Só o HASH do token é guardado.
@Injectable()
export class SessoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(dados: { usuarioId: number; tokenHash: string; expiraEm: Date }): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data: dados });
  }

  buscarPorHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Revoga um token de forma atômica. Devolve false se ele JÁ estava revogado: é o que detecta o reuso de
   * um token roubado (dois pedidos simultâneos com o mesmo token nunca vencem os dois).
   */
  async revogar(id: number): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    return count === 1;
  }

  /** Encerra todas as sessões do usuário (troca de senha, desativação, suspeita de roubo). */
  async revogarTodasDoUsuario(usuarioId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  /** Limpeza: apaga o que já expirou ou foi revogado há mais de 30 dias. */
  async removerAntigos(usuarioId: number): Promise<void> {
    const limite = new Date(Date.now() - 30 * 24 * 3_600_000);
    await this.prisma.refreshToken.deleteMany({
      where: { usuarioId, OR: [{ expiraEm: { lt: new Date() } }, { revogadoEm: { lt: limite } }] },
    });
  }
}
