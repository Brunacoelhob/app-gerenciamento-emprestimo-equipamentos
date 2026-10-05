import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';

// Cria o PRIMEIRO administrador a partir do ambiente (ADMIN_EMAIL e ADMIN_SENHA).
// Não existe senha padrão: sem as variáveis, o script se recusa a rodar. Assim nenhum deploy sobe com
// uma conta administradora conhecida. A senha nunca é impressa no terminal.
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA;
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';

  if (!email || !senha) {
    throw new Error('Defina ADMIN_EMAIL e ADMIN_SENHA no ambiente (.env) para criar o administrador inicial.');
  }
  if (senha.length < 12 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    throw new Error('ADMIN_SENHA precisa ter pelo menos 12 caracteres, com letras e números.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      console.log(`O administrador ${email} já existe: nada a fazer.`);
      return;
    }

    const custo = Number(process.env.BCRYPT_CUSTO) || 12;
    await prisma.usuario.create({
      data: { nome, email, senhaHash: await bcrypt.hash(senha, custo), role: Role.ADMIN },
    });
    console.log(`Administrador criado: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
