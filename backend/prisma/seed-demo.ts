import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Equipamento, Prisma, PrismaClient, Usuario } from '../generated/prisma/client';
import { Role, StatusEmprestimo } from '../generated/prisma/enums';
import { anexarFotos } from './fotos-demo';

// Dados FICTÍCIOS para demonstração e desenvolvimento: pessoas, equipamentos e um histórico de empréstimos
// (devolvidos, em andamento e atrasados). Nunca roda em produção. Pode ser executado de novo sem duplicar nada;
// com --refazer apaga a demonstração anterior e gera tudo de novo (npm run seed:demo -- --refazer).
//
// Todas as contas de demonstração usam a MESMA senha: a de DEMO_SENHA, ou uma aleatória (impressa uma única vez).

const DOMINIO = 'equipmentloan.com';
const DIA = 86_400_000;

const PESSOAS = [
  {
    nome: 'Fernanda Gestora',
    role: Role.ADMIN,
    avatar: 'animal:coruja',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '01310100',
    rua: 'Avenida Paulista',
  },
  {
    nome: 'Ana Souza',
    role: Role.USER,
    avatar: 'animal:gato',
    cidade: 'Campinas',
    uf: 'SP',
    cep: '13015904',
    rua: 'Rua Barão de Jaguara',
  },
  {
    nome: 'Bruno Lima',
    role: Role.USER,
    avatar: 'animal:cachorro',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    cep: '20040020',
    rua: 'Rua da Assembleia',
  },
  {
    nome: 'Carla Mendes',
    role: Role.USER,
    avatar: 'animal:raposa',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    cep: '30130010',
    rua: 'Avenida Afonso Pena',
  },
  {
    nome: 'Diego Ferreira',
    role: Role.USER,
    avatar: 'animal:panda',
    cidade: 'Curitiba',
    uf: 'PR',
    cep: '80010000',
    rua: 'Rua XV de Novembro',
  },
  {
    nome: 'Elisa Rocha',
    role: Role.USER,
    avatar: 'animal:coala',
    cidade: 'Porto Alegre',
    uf: 'RS',
    cep: '90010150',
    rua: 'Rua dos Andradas',
  },
  {
    nome: 'Felipe Araújo',
    role: Role.USER,
    avatar: 'animal:leao',
    cidade: 'Salvador',
    uf: 'BA',
    cep: '40020000',
    rua: 'Rua Chile',
  },
  {
    nome: 'Gabriela Nunes',
    role: Role.USER,
    avatar: 'animal:pinguim',
    cidade: 'Recife',
    uf: 'PE',
    cep: '50010000',
    rua: 'Rua do Bom Jesus',
  },
  {
    nome: 'Henrique Dias',
    role: Role.USER,
    avatar: null,
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88010000',
    rua: 'Rua Felipe Schmidt',
  },
];

const EQUIPAMENTOS: [string, string][] = [
  ['Notebook Dell Latitude 5440', 'Core i5, 16GB RAM, SSD 512GB'],
  ['Notebook Lenovo ThinkPad E14', 'Core i7, 16GB RAM, SSD 512GB'],
  ['MacBook Air M2', '13 polegadas, 8GB RAM'],
  ['Projetor Epson PowerLite', '3.600 lúmens, HDMI e VGA'],
  ['Projetor BenQ MW535', 'Portátil, 3.600 lúmens'],
  ['Câmera Canon EOS Rebel T7', 'Com lente 18-55mm e duas baterias'],
  ['Câmera GoPro Hero 11', "À prova d'água, com suporte de capacete"],
  ['Microfone Shure SM58', 'Dinâmico, com cabo XLR e pedestal'],
  ['Caixa de som JBL PartyBox', 'Bluetooth, bateria de 12 horas'],
  ['Tablet Samsung Galaxy Tab S8', 'Com caneta S Pen e capa'],
  ['Monitor Dell 27" 4K', 'Entrada USB-C e HDMI'],
  ['Furadeira Bosch GSB 13', 'Com maleta e jogo de brocas'],
  ['Parafusadeira Makita 12V', 'Duas baterias e carregador'],
  ['Multímetro Fluke 117', 'Digital, True RMS'],
  ['Tripé Manfrotto 190', 'Alumínio, até 4 kg'],
  ['Kit Arduino Mega', 'Placa, sensores e protoboard'],
  ['Impressora 3D Creality Ender 3', 'Mesa de 220x220 mm'],
  ['Roteador Wi-Fi 6 TP-Link', 'Dual band, para eventos'],
];

// Gerador pseudoaleatório fixo: a demonstração sai igual toda vez.
function gerador(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function cpfFicticio(n: number): string {
  const base = String(100_000_000 + n * 7_919_011)
    .slice(0, 9)
    .padStart(9, '1');
  const digito = (tamanho: number, digitos: string) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(digitos[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(9, base);
  const d2 = digito(10, base + d1);
  return `${base}${d1}${d2}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Os dados de demonstração não rodam em produção.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (process.argv.includes('--refazer')) {
      // Apaga SÓ o que esta demonstração criou (contas @demo, seus empréstimos e os equipamentos da lista sem uso)
      const ids = (
        await prisma.usuario.findMany({ where: { email: { endsWith: `@${DOMINIO}` } }, select: { id: true } })
      ).map((u) => u.id);
      await prisma.emprestimo.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
      await prisma.equipamento.deleteMany({
        where: { nome: { in: EQUIPAMENTOS.map(([nome]) => nome) }, emprestimos: { none: {} } },
      });
      console.log('Dados de demonstração anteriores removidos.');
    }

    if (await prisma.usuario.findFirst({ where: { email: { endsWith: `@${DOMINIO}` } } })) {
      console.log('Os dados de demonstração já existem: nada a fazer.');
      return;
    }

    const aleatoria = !process.env.DEMO_SENHA;
    const senha = process.env.DEMO_SENHA ?? `Demo${randomBytes(6).toString('hex')}9`;
    const senhaHash = await bcrypt.hash(senha, Number(process.env.BCRYPT_CUSTO) || 12);
    const rnd = gerador(42);
    const agora = Date.now();

    // Pessoas
    const usuarios: Usuario[] = [];
    for (const [i, p] of PESSOAS.entries()) {
      const [primeiro, ...resto] = p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ');
      usuarios.push(
        await prisma.usuario.create({
          data: {
            nome: p.nome,
            email: `${primeiro}.${resto[resto.length - 1]}@${DOMINIO}`,
            senhaHash,
            role: p.role,
            cpf: cpfFicticio(i + 1),
            telefone: `119${String(80_000_000 + Math.floor(rnd() * 19_999_999))}`,
            cep: p.cep,
            logradouro: p.rua,
            numero: String(10 + Math.floor(rnd() * 990)),
            bairro: 'Centro',
            cidade: p.cidade,
            uf: p.uf,
            avatar: p.avatar,
            criadoEm: new Date(agora - (90 - i * 5) * DIA),
          },
        }),
      );
    }
    const pessoasComuns = usuarios.filter((u) => u.role === Role.USER);

    // Equipamentos (reaproveita os que já existirem com o mesmo nome)
    const equipamentos: Equipamento[] = [];
    for (const [i, [nome, descricao]] of EQUIPAMENTOS.entries()) {
      const existente = await prisma.equipamento.findFirst({ where: { nome } });
      const ativo = i < EQUIPAMENTOS.length - 2; // os dois últimos estão fora de uso (manutenção)
      equipamentos.push(
        existente ??
          (await prisma.equipamento.create({
            data: { nome, descricao, ativo, criadoEm: new Date(agora - 80 * DIA) },
          })),
      );
    }

    // Empréstimos: uma linha do tempo por equipamento, de ~85 dias atrás até hoje, com volume suficiente para os
    // gráficos do painel. Os primeiros equipamentos da lista são os mais populares (esperam menos entre um
    // empréstimo e outro); ~20% das devoluções saem atrasadas; o último empréstimo de alguns ainda está em andamento.
    const PRAZOS = [3, 5, 7, 7, 7, 10, 14];
    const HORA = 3_600_000;
    const emprestimos: Prisma.EmprestimoCreateManyInput[] = [];
    for (const [i, equipamento] of equipamentos.entries()) {
      if (!equipamento.ativo) continue;
      const espera = 1 + i * 0.5; // dias médios de espera entre um empréstimo e o seguinte
      // A cada três equipamentos, um é "designado" a terminar com um empréstimo atrasado: o histórico dele para
      // 8 dias antes de hoje e então a pessoa o retira com prazo de 3 dias e não devolve (assim o painel tem
      // atrasos para mostrar e nenhum empréstimo se sobrepõe a outro do mesmo equipamento).
      const designado = i % 3 === 1;
      const fim = designado ? agora - 8 * DIA : agora;
      let cursor = agora - 85 * DIA + rnd() * 5 * DIA;
      for (;;) {
        const retirada = cursor + rnd() * espera * 2 * DIA;
        if (retirada > fim - 2 * HORA) break; // o equipamento está livre agora
        const prazoDias = PRAZOS[Math.floor(rnd() * PRAZOS.length)];
        const atrasou = rnd() < 0.2;
        const usoDias = atrasou ? prazoDias + 1 + rnd() * 5 : Math.max(0.5, prazoDias * (0.3 + rnd() * 0.7));
        const devolucao = retirada + usoDias * DIA;
        if (devolucao >= fim - HORA) {
          if (designado) break; // o fim do histórico dele já foi decidido acima
          emprestimos.push({
            usuarioId: pessoasComuns[Math.floor(rnd() * pessoasComuns.length)].id,
            equipamentoId: equipamento.id,
            status: StatusEmprestimo.ATIVO, // ainda com a pessoa
            dataRetirada: new Date(retirada),
            prazoDevolucao: new Date(retirada + prazoDias * DIA),
          });
          break;
        }
        emprestimos.push({
          usuarioId: pessoasComuns[Math.floor(rnd() * pessoasComuns.length)].id,
          equipamentoId: equipamento.id,
          status: StatusEmprestimo.DEVOLVIDO,
          dataRetirada: new Date(retirada),
          prazoDevolucao: new Date(retirada + prazoDias * DIA),
          dataDevolucao: new Date(devolucao),
        });
        cursor = devolucao;
      }

      if (designado) {
        const retirada = agora - (4 + rnd() * 4) * DIA; // entre 4 e 8 dias atrás: o prazo de 3 dias já venceu
        emprestimos.push({
          usuarioId: pessoasComuns[Math.floor(rnd() * pessoasComuns.length)].id,
          equipamentoId: equipamento.id,
          status: StatusEmprestimo.ATIVO,
          dataRetirada: new Date(retirada),
          prazoDevolucao: new Date(retirada + 3 * DIA),
        });
      }
    }
    await prisma.emprestimo.createMany({ data: emprestimos });
    await anexarFotos(prisma); // fotos reais (prisma/fotos-demo)
    const devolvidos = emprestimos.filter((e) => e.status === StatusEmprestimo.DEVOLVIDO).length;
    const ativos = emprestimos.filter((e) => e.status === StatusEmprestimo.ATIVO);
    const andamento = ativos.length;
    const atrasados = ativos.filter((e) => new Date(e.prazoDevolucao).getTime() < agora).length;

    console.log(
      `Demonstração criada: ${usuarios.length} pessoas, ${equipamentos.length} equipamentos, ` +
        `${devolvidos} empréstimos devolvidos, ${andamento} em andamento (${atrasados} atrasados).`,
    );
    console.log(`Entre com qualquer conta @${DOMINIO}, por exemplo ${usuarios[1].email}`);
    console.log(aleatoria ? `Senha de todas elas (mostrada só agora): ${senha}` : 'Senha: o valor de DEMO_SENHA.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
