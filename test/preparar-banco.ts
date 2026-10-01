import { execSync } from 'node:child_process';
import { Client } from 'pg';

// Roda uma vez antes da suíte de integração: aplica as migrations no banco de TESTE e zera as tabelas.
// Trava de segurança: exige DATABASE_URL_TESTE e recusa qualquer nome de banco sem "test",
// para NUNCA apagar o banco de desenvolvimento por engano.
export default async function prepararBanco() {
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) {
    throw new Error(
      'Defina DATABASE_URL_TESTE (um banco EXCLUSIVO para testes, ex.: postgresql://usuario:senha@localhost:5432/emprestimo_teste).',
    );
  }
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(
      'O banco de testes precisa ter "test" ou "teste" no nome, para nunca apagar o banco de desenvolvimento.',
    );
  }

  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      await cliente.query(`TRUNCATE TABLE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await cliente.end();
  }
}
