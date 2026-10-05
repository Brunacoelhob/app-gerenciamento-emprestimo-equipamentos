-- Segurança e integridade.
--
-- 1. E-mails sempre em minúsculas (CHECK) e hash da senha com nome honesto.
-- 2. Conta ativa/inativa e carimbo de atualização.
-- 3. "emprestado" deixa de ser coluna: passa a ser derivado do empréstimo ATIVO (uma só fonte da verdade).
-- 4. Prazo de devolução nos empréstimos.
-- 5. INTEGRIDADE: índice único PARCIAL garante no máximo um empréstimo ATIVO por equipamento.
--    É o que impede, no próprio banco, que duas pessoas peguem o mesmo item mesmo sob requisições simultâneas.
-- 6. Tabela de refresh tokens (sessões renováveis, guardadas só como hash).

-- ---------------------------------------------------------------------------
-- Pré-checagens: se os dados antigos violarem as novas regras, a migration
-- para com uma mensagem clara em vez de falhar no meio ou corromper dados.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Usuario" GROUP BY lower(trim("email")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Existem usuários com e-mails que só diferem em maiúsculas/minúsculas. Una ou remova as contas duplicadas antes de migrar.';
  END IF;

  IF EXISTS (SELECT 1 FROM "Emprestimo" WHERE "status" = 'ATIVO' GROUP BY "equipamentoId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Existem equipamentos com mais de um empréstimo ATIVO. Devolva os duplicados antes de migrar.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Usuário
-- ---------------------------------------------------------------------------
UPDATE "Usuario" SET "email" = lower(trim("email"));
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_email_minusculo" CHECK ("email" = lower("email"));

ALTER TABLE "Usuario" RENAME COLUMN "senha" TO "senhaHash";
ALTER TABLE "Usuario" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Usuario" ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- Equipamento: "emprestado" passa a ser derivado
-- ---------------------------------------------------------------------------
ALTER TABLE "Equipamento" ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Equipamento" DROP COLUMN "emprestado";

-- ---------------------------------------------------------------------------
-- Empréstimo: prazo e integridade
-- ---------------------------------------------------------------------------
ALTER TABLE "Emprestimo" ADD COLUMN "prazoDevolucao" TIMESTAMP(3);
UPDATE "Emprestimo" SET "prazoDevolucao" = "dataRetirada" + interval '7 days';
ALTER TABLE "Emprestimo" ALTER COLUMN "prazoDevolucao" SET NOT NULL;

CREATE INDEX "Emprestimo_usuarioId_status_idx" ON "Emprestimo"("usuarioId", "status");
CREATE INDEX "Emprestimo_equipamentoId_status_idx" ON "Emprestimo"("equipamentoId", "status");

-- A garantia central: um equipamento só pode ter UM empréstimo ATIVO.
CREATE UNIQUE INDEX "Emprestimo_um_ativo_por_equipamento"
  ON "Emprestimo"("equipamentoId")
  WHERE "status" = 'ATIVO';

-- ---------------------------------------------------------------------------
-- Refresh tokens
-- ---------------------------------------------------------------------------
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
