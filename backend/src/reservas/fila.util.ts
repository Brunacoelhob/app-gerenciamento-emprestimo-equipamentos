import { Prisma } from '../../generated/prisma/client';
import { StatusEmprestimo, StatusReserva } from '../../generated/prisma/enums';

/** Quanto tempo quem reservou primeiro tem, com exclusividade, para pegar o equipamento depois que ele volta. */
export const HORAS_DE_PRIORIDADE = 24;

/**
 * Mantém a fila do equipamento em ordem. Roda DENTRO da transação que já travou o equipamento (FOR UPDATE), então
 * duas pessoas nunca disputam a vez ao mesmo tempo:
 *  1. quem tinha a vez e deixou o prazo passar sai da fila (EXPIRADA);
 *  2. se o equipamento está livre e ninguém tem a vez agora, a vez passa para o primeiro da fila (com conta ativa).
 * Devolve quem tem a vez neste instante, se houver.
 */
export async function promoverFila(
  tx: Prisma.TransactionClient,
  equipamentoId: number,
  agora: Date,
): Promise<{ usuarioId: number; ate: Date } | null> {
  await tx.reserva.updateMany({
    where: { equipamentoId, status: StatusReserva.AGUARDANDO, prioridadeAte: { lte: agora } },
    data: { status: StatusReserva.EXPIRADA },
  });

  const atual = await tx.reserva.findFirst({
    where: { equipamentoId, status: StatusReserva.AGUARDANDO, prioridadeAte: { gt: agora } },
  });
  if (atual?.prioridadeAte) return { usuarioId: atual.usuarioId, ate: atual.prioridadeAte };

  const emprestado = await tx.emprestimo.count({ where: { equipamentoId, status: StatusEmprestimo.ATIVO } });
  const ativo = await tx.equipamento.findUnique({ where: { id: equipamentoId }, select: { ativo: true } });
  if (emprestado > 0 || !ativo?.ativo) return null;

  const proximo = await tx.reserva.findFirst({
    where: { equipamentoId, status: StatusReserva.AGUARDANDO, usuario: { ativo: true } },
    orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
  });
  if (!proximo) return null;

  const ate = new Date(agora.getTime() + HORAS_DE_PRIORIDADE * 3_600_000);
  await tx.reserva.update({ where: { id: proximo.id }, data: { prioridadeAte: ate, avisadoEm: null } });
  return { usuarioId: proximo.usuarioId, ate };
}
