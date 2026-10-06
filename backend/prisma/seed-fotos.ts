import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { anexarFotos } from './fotos-demo';

// Coloca fotos reais nos equipamentos que ainda não têm (npm run seed:fotos). Nunca roda em produção.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('As fotos de demonstração não rodam em produção.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    console.log(`${await anexarFotos(prisma)} equipamentos receberam foto.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
