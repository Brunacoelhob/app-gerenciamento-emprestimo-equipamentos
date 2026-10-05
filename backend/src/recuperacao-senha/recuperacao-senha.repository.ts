import { Injectable } from '@nestjs/common';
import { RecuperacaoSenha } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Acesso aos pedidos de recuperação de senha. Só o HASH do token é guardado.
@Injectable()
export class RecuperacaoSenhaRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(dados: { usuarioId: number; tokenHash: string; expiraEm: Date }): Promise<RecuperacaoSenha> {
    return this.prisma.recuperacaoSenha.create({ data: dados });
  }

  buscarPorHash(tokenHash: string): Promise<RecuperacaoSenha | null> {
    return this.prisma.recuperacaoSenha.findUnique({ where: { tokenHash } });
  }

  /** Quantos pedidos a pessoa fez na última hora (para limitar abuso: ninguém é inundado de e-mails). */
  contarDaUltimaHora(usuarioId: number): Promise<number> {
    return this.prisma.recuperacaoSenha.count({
      where: { usuarioId, criadoEm: { gte: new Date(Date.now() - 3_600_000) } },
    });
  }

  /** Um pedido novo substitui os anteriores: só o link mais recente vale. */
  async invalidarPendentes(usuarioId: number): Promise<void> {
    await this.prisma.recuperacaoSenha.updateMany({
      where: { usuarioId, usadoEm: null },
      data: { usadoEm: new Date() },
    });
  }

  /**
   * Usa o token de forma ATÔMICA. Devolve false se ele já foi usado ou expirou: dois pedidos simultâneos com o
   * mesmo link nunca vencem os dois.
   */
  async consumir(id: number): Promise<boolean> {
    const agora = new Date();
    const { count } = await this.prisma.recuperacaoSenha.updateMany({
      where: { id, usadoEm: null, expiraEm: { gt: agora } },
      data: { usadoEm: agora },
    });
    return count === 1;
  }
}
