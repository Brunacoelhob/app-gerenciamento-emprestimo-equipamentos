-- Registro de que a pessoa aceitou a Política de Privacidade ao criar a conta (e qual versão ela leu).
ALTER TABLE "Usuario" ADD COLUMN "politicaAceitaEm" TIMESTAMP(3);
ALTER TABLE "Usuario" ADD COLUMN "politicaVersao" TEXT;
