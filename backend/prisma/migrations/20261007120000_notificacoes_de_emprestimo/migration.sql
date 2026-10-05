-- Controle dos avisos por e-mail (lembrete de vencimento e atraso)
ALTER TABLE "Emprestimo"
  ADD COLUMN "lembreteEnviadoEm" TIMESTAMP(3),
  ADD COLUMN "ultimoAvisoAtrasoEm" TIMESTAMP(3);
