-- Código público: chave aleatória exibida nas telas no lugar do número sequencial (que revela volume e ordem).
ALTER TABLE "Usuario" ADD COLUMN "codigo" TEXT NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
ALTER TABLE "Equipamento" ADD COLUMN "codigo" TEXT NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
ALTER TABLE "Emprestimo" ADD COLUMN "codigo" TEXT NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

CREATE UNIQUE INDEX "Usuario_codigo_key" ON "Usuario"("codigo");
CREATE UNIQUE INDEX "Equipamento_codigo_key" ON "Equipamento"("codigo");
CREATE UNIQUE INDEX "Emprestimo_codigo_key" ON "Emprestimo"("codigo");
