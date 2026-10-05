-- Renomeia o enum e a coluna preservando os dados existentes
-- (RENAME em vez de DROP+CREATE, que o prisma migrate dev geraria por padrao)
ALTER TYPE "Papel" RENAME TO "Role";
ALTER TABLE "Usuario" RENAME COLUMN "papel" TO "role";
