-- Fila de espera: quem quer um equipamento que está emprestado entra na fila e é avisado quando ele voltar.
CREATE TYPE "StatusReserva" AS ENUM ('AGUARDANDO', 'ATENDIDA', 'CANCELADA');

CREATE TABLE "Reserva" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "equipamentoId" INTEGER NOT NULL,
    "status" "StatusReserva" NOT NULL DEFAULT 'AGUARDANDO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avisadoEm" TIMESTAMP(3),
    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reserva_equipamentoId_status_criadoEm_idx" ON "Reserva"("equipamentoId", "status", "criadoEm");
CREATE INDEX "Reserva_usuarioId_status_idx" ON "Reserva"("usuarioId", "status");

-- Uma pessoa só entra uma vez na fila do mesmo equipamento (o índice parcial vale só para quem ainda aguarda)
CREATE UNIQUE INDEX "Reserva_aguardando_unica" ON "Reserva"("usuarioId", "equipamentoId") WHERE "status" = 'AGUARDANDO';

ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
