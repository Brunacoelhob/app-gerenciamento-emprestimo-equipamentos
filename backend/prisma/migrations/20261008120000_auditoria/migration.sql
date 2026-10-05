-- Trilha de auditoria (quem fez o quê e quando)
CREATE TABLE "RegistroAuditoria" (
    "id" SERIAL NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atorId" INTEGER,
    "atorNome" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" INTEGER,
    "detalhes" JSONB,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistroAuditoria_criadoEm_idx" ON "RegistroAuditoria"("criadoEm");
CREATE INDEX "RegistroAuditoria_acao_criadoEm_idx" ON "RegistroAuditoria"("acao", "criadoEm");
CREATE INDEX "RegistroAuditoria_atorId_criadoEm_idx" ON "RegistroAuditoria"("atorId", "criadoEm");
