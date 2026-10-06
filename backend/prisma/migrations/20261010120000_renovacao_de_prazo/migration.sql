-- Renovação de prazo: quantas vezes o empréstimo já foi renovado (o limite fica na regra de negócio).
ALTER TABLE "Emprestimo" ADD COLUMN "renovacoes" INTEGER NOT NULL DEFAULT 0;
