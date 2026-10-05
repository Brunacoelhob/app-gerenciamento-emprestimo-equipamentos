-- Dados de perfil do usuário (todos opcionais)
ALTER TABLE "Usuario"
  ADD COLUMN "cpf" TEXT,
  ADD COLUMN "telefone" TEXT,
  ADD COLUMN "cep" TEXT,
  ADD COLUMN "logradouro" TEXT,
  ADD COLUMN "numero" TEXT,
  ADD COLUMN "complemento" TEXT,
  ADD COLUMN "bairro" TEXT,
  ADD COLUMN "cidade" TEXT,
  ADD COLUMN "uf" TEXT,
  ADD COLUMN "avatar" TEXT;

-- Um CPF pertence a uma única conta (vários NULL são permitidos)
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");
