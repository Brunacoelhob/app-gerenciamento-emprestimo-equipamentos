-- Foto do equipamento, em tabela à parte: as listagens não carregam os bytes da imagem, só a versão dela.
CREATE TABLE "FotoEquipamento" (
    "equipamentoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FotoEquipamento_pkey" PRIMARY KEY ("equipamentoId")
);

ALTER TABLE "FotoEquipamento" ADD CONSTRAINT "FotoEquipamento_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
