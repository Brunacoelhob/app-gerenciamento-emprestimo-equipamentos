import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';

// Fotos REAIS para os equipamentos de demonstração (Wikimedia Commons; autores e licenças em
// prisma/fotos-demo/CREDITOS.md). O equipamento recebe a foto da primeira palavra-chave que aparece no nome, da mais
// específica para a mais geral. Só roda fora de produção e só preenche quem ainda não tem foto.
const REGRAS: [RegExp, string][] = [
  [/macbook/, 'macbook'],
  [/gopro/, 'gopro'],
  [/impressora 3d/, 'impressora-3d'],
  [/impressora/, 'impressora'],
  [/notebook/, 'notebook'],
  [/projetor/, 'projetor'],
  [/camera/, 'camera'],
  [/microfone/, 'microfone'],
  [/caixa de som/, 'caixa-de-som'],
  [/tablet/, 'tablet'],
  [/monitor/, 'monitor'],
  [/furadeira/, 'furadeira'],
  [/parafusadeira/, 'parafusadeira'],
  [/multimetro/, 'multimetro'],
  [/tripe/, 'tripe'],
  [/arduino/, 'arduino'],
  [/roteador/, 'roteador'],
  [/mouse/, 'mouse'],
];

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function pasta(): string {
  // compilado em dist/prisma/ (as imagens ficam no código-fonte, em prisma/fotos-demo) ou rodando do código-fonte
  const candidatas = [resolve(__dirname, '../../prisma/fotos-demo'), resolve(__dirname, 'fotos-demo')];
  const achada = candidatas.find((c) => existsSync(c));
  if (!achada) throw new Error('Pasta prisma/fotos-demo não encontrada.');
  return achada;
}

export async function anexarFotos(prisma: PrismaClient): Promise<number> {
  const dir = pasta();
  const equipamentos = await prisma.equipamento.findMany({ where: { foto: null }, select: { id: true, nome: true } });
  let total = 0;
  for (const e of equipamentos) {
    const nome = normalizar(e.nome);
    const regra = REGRAS.find(([padrao]) => padrao.test(nome));
    if (!regra) continue;
    const dados = readFileSync(resolve(dir, `${regra[1]}.jpg`));
    await prisma.fotoEquipamento.create({
      data: { equipamentoId: e.id, tipo: 'image/jpeg', dados: new Uint8Array(dados) },
    });
    total += 1;
  }
  return total;
}
