import { Injectable } from '@nestjs/common';
import { StatusEmprestimo, StatusReserva } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { promoverFila } from './fila.util';

@Injectable()
export class ReservasRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscarEquipamento(id: number) {
    return this.prisma.equipamento.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        ativo: true,
        emprestimos: { where: { status: StatusEmprestimo.ATIVO }, select: { usuarioId: true } },
      },
    });
  }

  criar(usuarioId: number, equipamentoId: number) {
    return this.prisma.reserva.create({ data: { usuarioId, equipamentoId } });
  }

  buscarPorId(id: number) {
    return this.prisma.reserva.findUnique({ where: { id } });
  }

  /** Cancela só se ainda aguarda (dois cancelamentos seguidos não se atropelam). */
  async cancelar(id: number): Promise<boolean> {
    const { count } = await this.prisma.reserva.updateMany({
      where: { id, status: StatusReserva.AGUARDANDO },
      data: { status: StatusReserva.CANCELADA },
    });
    return count === 1;
  }

  /** A pessoa pegou o equipamento: a espera dela terminou. */
  async marcarAtendida(usuarioId: number, equipamentoId: number): Promise<void> {
    await this.prisma.reserva.updateMany({
      where: { usuarioId, equipamentoId, status: StatusReserva.AGUARDANDO },
      data: { status: StatusReserva.ATENDIDA },
    });
  }

  /** As filas de uma pessoa, com a posição em cada uma (1 = a próxima a ser avisada). */
  async minhas(usuarioId: number) {
    const reservas = await this.prisma.reserva.findMany({
      where: { usuarioId, status: StatusReserva.AGUARDANDO },
      orderBy: { criadoEm: 'asc' },
      include: { equipamento: { select: { id: true, codigo: true, nome: true } } },
    });
    return Promise.all(
      reservas.map(async (r) => ({
        ...r,
        posicao:
          1 +
          (await this.prisma.reserva.count({
            where: {
              equipamentoId: r.equipamentoId,
              status: StatusReserva.AGUARDANDO,
              OR: [{ criadoEm: { lt: r.criadoEm } }, { criadoEm: r.criadoEm, id: { lt: r.id } }],
            },
          })),
      })),
    );
  }

  /** Quantas pessoas esperam por cada equipamento (para mostrar "fila: 2" na lista). */
  async tamanhoDasFilas(equipamentoIds: number[]): Promise<Map<number, number>> {
    if (equipamentoIds.length === 0) return new Map();
    const grupos = await this.prisma.reserva.groupBy({
      by: ['equipamentoId'],
      where: { equipamentoId: { in: equipamentoIds }, status: StatusReserva.AGUARDANDO },
      _count: { _all: true },
    });
    return new Map(grupos.map((g) => [g.equipamentoId, g._count._all]));
  }

  /** Passa a vez ao próximo (ou expira quem não pegou a tempo) numa transação com o equipamento travado. */
  promover(equipamentoId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Equipamento" WHERE "id" = ${equipamentoId} FOR UPDATE`;
      return promoverFila(tx, equipamentoId, new Date());
    });
  }

  /** Equipamentos que têm gente na fila (para a rotina que passa a vez quando o prazo de alguém acaba). */
  async equipamentosComFila(): Promise<number[]> {
    const grupos = await this.prisma.reserva.groupBy({
      by: ['equipamentoId'],
      where: { status: StatusReserva.AGUARDANDO },
    });
    return grupos.map((g) => g.equipamentoId);
  }

  /** Quem tem a vez agora e ainda não foi avisado. */
  vezesSemAviso() {
    return this.prisma.reserva.findMany({
      where: { status: StatusReserva.AGUARDANDO, prioridadeAte: { gt: new Date() }, avisadoEm: null },
      include: { usuario: { select: { nome: true, email: true } }, equipamento: { select: { nome: true } } },
    });
  }

  /** Marca o aviso como enviado; só um chamador vence (duas instâncias da API não avisam duas vezes). */
  async reivindicarAviso(id: number, quando: Date): Promise<boolean> {
    const { count } = await this.prisma.reserva.updateMany({
      where: { id, avisadoEm: null },
      data: { avisadoEm: quando },
    });
    return count === 1;
  }

  /** Equipamentos com alguém na vez agora: o "reservado" da lista. */
  async emVez(equipamentoIds: number[]): Promise<Set<number>> {
    if (equipamentoIds.length === 0) return new Set();
    const linhas = await this.prisma.reserva.findMany({
      where: {
        equipamentoId: { in: equipamentoIds },
        status: StatusReserva.AGUARDANDO,
        prioridadeAte: { gt: new Date() },
      },
      select: { equipamentoId: true },
    });
    return new Set(linhas.map((l) => l.equipamentoId));
  }

  /** O primeiro da fila que ainda tem conta ativa. */
  primeiroDaFila(equipamentoId: number) {
    return this.prisma.reserva.findFirst({
      where: { equipamentoId, status: StatusReserva.AGUARDANDO, usuario: { ativo: true } },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      include: { usuario: { select: { nome: true, email: true } }, equipamento: { select: { nome: true } } },
    });
  }

  async registrarAviso(id: number, quando: Date): Promise<void> {
    await this.prisma.reserva.update({ where: { id }, data: { avisadoEm: quando } });
  }
}
