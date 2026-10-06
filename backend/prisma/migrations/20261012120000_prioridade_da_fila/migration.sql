-- Prioridade de quem reservou primeiro: ao devolver, o primeiro da fila ganha um prazo exclusivo para retirar.
ALTER TYPE "StatusReserva" ADD VALUE 'EXPIRADA';
ALTER TABLE "Reserva" ADD COLUMN "prioridadeAte" TIMESTAMP(3);
