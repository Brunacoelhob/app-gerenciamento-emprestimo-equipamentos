// Testes de integração: sobem a API inteira (mesma configuração da produção: versão, validação, filtros)
// contra um PostgreSQL de TESTE e chamam as rotas de verdade por HTTP.
// Cobrem o que testes unitários não alcançam: permissões, integridade sob concorrência e sessões.

// O ambiente precisa estar pronto ANTES de a aplicação ser importada (a configuração é lida na importação).
process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_CUSTO = '4'; // rápido nos testes; em produção o padrão é 12
delete process.env.CORS_ORIGENS;

import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';

const SENHA = 'SenhaForte123';

describe('API de empréstimo de equipamentos (integração)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let http: ReturnType<typeof request>;
  let senhaHash: string;
  let contador = 0;

  // ---------- ajudantes ----------

  // Zera os contadores do limite de requisições: vários testes passam do limite real de propósito.
  const zerarLimites = () => {
    const armazem = app.get(ThrottlerStorage);
    armazem.storage.clear();
    armazem.hitExpirations?.clear();
  };

  // Cria o usuário direto no banco (rápido) e já devolve um token válido, sem passar pelo login limitado.
  async function criarUsuario(role: 'USER' | 'ADMIN' = 'USER', ativo = true) {
    const n = ++contador;
    const usuario = await prisma.usuario.create({
      data: { nome: `Pessoa ${n}`, email: `pessoa${n}@teste.com`, senhaHash, role, ativo },
    });
    return { ...usuario, token: await jwt.signAsync({ sub: usuario.id }) };
  }
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function criarEquipamento(nome = `Equipamento ${++contador}`, ativo = true) {
    return prisma.equipamento.create({ data: { nome, ativo } });
  }

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configurarApp } = await import('../src/configurar-app.js');

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    http = request(app.getHttpServer());
    senhaHash = await bcrypt.hash(SENHA, 4);
  });

  beforeEach(() => zerarLimites());

  afterAll(async () => {
    await app.close();
  });

  // =====================================================================================================
  describe('saúde e segurança básica', () => {
    it('GET /saude é público e confirma o banco', async () => {
      const r = await http.get('/saude').expect(200);
      expect(r.body).toMatchObject({ status: 'ok', banco: 'ok' });
    });

    it('as rotas de negócio ficam sob /v1', async () => {
      await http.get('/equipamentos').expect(404); // sem a versão não existe
      await http.get('/v1/equipamentos').expect(401); // existe, mas exige login
    });

    it('rotas protegidas sem token devolvem 401 (seguro por padrão)', async () => {
      await http.get('/v1/equipamentos').expect(401);
      await http.get('/v1/emprestimos/meus').expect(401);
      await http.get('/v1/usuarios').expect(401);
      await http.post('/v1/emprestimos').send({ equipamentoId: 1 }).expect(401);
    });

    it('token inválido ou de outro segredo devolve 401', async () => {
      await http.get('/v1/equipamentos').set(auth('lixo')).expect(401);
      const falso = new JwtService({ secret: 'outro-segredo-qualquer-com-mais-de-32-caracteres' }).sign({ sub: 1 });
      await http.get('/v1/equipamentos').set(auth(falso)).expect(401);
    });

    it('não expõe x-powered-by, envia cabeçalhos do helmet e não libera CORS sem configuração', async () => {
      const r = await http.get('/saude').set('Origin', 'https://site-qualquer.com');
      expect(r.headers['x-powered-by']).toBeUndefined();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('erros seguem o formato padrão em português (404 e validação)', async () => {
      const r = await http.get('/v1/nao-existe').expect(404);
      expect(r.body).toEqual(
        expect.objectContaining({
          statusCode: 404,
          erro: 'Não encontrado',
          mensagem: expect.any(String),
          caminho: '/v1/nao-existe',
          timestamp: expect.any(String),
        }),
      );
      const invalido = await http.post('/v1/auth/login').send({ email: 'x' }).expect(400);
      expect(invalido.body).toMatchObject({ statusCode: 400, erro: 'Requisição inválida' });
      expect(Array.isArray(invalido.body.mensagem)).toBe(true); // uma mensagem por campo inválido
    });
  });

  // =====================================================================================================
  describe('FALHA CORRIGIDA 1: ninguém vira ADMIN pelo cadastro público', () => {
    it('cadastro cria sempre um USER e nunca devolve a senha', async () => {
      const r = await http
        .post('/v1/auth/registro')
        .send({ nome: 'Maria Silva', email: 'maria@teste.com', senha: SENHA })
        .expect(201);
      expect(r.body).toMatchObject({ nome: 'Maria Silva', email: 'maria@teste.com', role: 'USER', ativo: true });
      expect(JSON.stringify(r.body)).not.toMatch(/senha|hash/i);
    });

    it('enviar role=ADMIN no cadastro é recusado (400) e NÃO cria a conta', async () => {
      const r = await http
        .post('/v1/auth/registro')
        .send({ nome: 'Atacante', email: 'atacante@teste.com', senha: SENHA, role: 'ADMIN' })
        .expect(400);
      expect(r.body.mensagem).toEqual(['O campo "role" não é permitido.']);
      expect(await prisma.usuario.count({ where: { email: 'atacante@teste.com' } })).toBe(0);
    });

    it('um USER comum não consegue criar admin nem promover ninguém (403)', async () => {
      const usuario = await criarUsuario('USER');
      await http
        .post('/v1/usuarios')
        .set(auth(usuario.token))
        .send({ nome: 'X', email: 'x@teste.com', senha: SENHA, role: 'ADMIN' })
        .expect(403);
      await http.patch(`/v1/usuarios/${usuario.id}`).set(auth(usuario.token)).send({ role: 'ADMIN' }).expect(403);
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).role).toBe('USER');
    });

    it('só um ADMIN cria outro ADMIN', async () => {
      const admin = await criarUsuario('ADMIN');
      const r = await http
        .post('/v1/usuarios')
        .set(auth(admin.token))
        .send({ nome: 'Novo Admin', email: 'novo.admin@teste.com', senha: SENHA, role: 'ADMIN' })
        .expect(201);
      expect(r.body.role).toBe('ADMIN');
    });

    it('o papel vale na hora: promover ou rebaixar muda o acesso mesmo com o mesmo token', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      await http.get('/v1/usuarios').set(auth(pessoa.token)).expect(403);

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ role: 'ADMIN' }).expect(200);
      await http.get('/v1/usuarios').set(auth(pessoa.token)).expect(200); // mesmo token, papel novo

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ role: 'USER' }).expect(200);
      await http.get('/v1/usuarios').set(auth(pessoa.token)).expect(403);
    });

    it('um admin não pode rebaixar nem desativar a própria conta', async () => {
      const admin = await criarUsuario('ADMIN');
      await http.patch(`/v1/usuarios/${admin.id}`).set(auth(admin.token)).send({ role: 'USER' }).expect(403);
      await http.patch(`/v1/usuarios/${admin.id}`).set(auth(admin.token)).send({ ativo: false }).expect(403);
    });
  });

  // =====================================================================================================
  describe('cadastro e login', () => {
    it('e-mail é normalizado: maiúsculas e espaços não criam outra conta', async () => {
      await http
        .post('/v1/auth/registro')
        .send({ nome: 'Ana Souza', email: 'Ana.Souza@Teste.com ', senha: SENHA })
        .expect(201);
      await http
        .post('/v1/auth/registro')
        .send({ nome: 'Ana Dois', email: 'ANA.SOUZA@teste.com', senha: SENHA })
        .expect(409);
      const r = await http.post('/v1/auth/login').send({ email: 'ANA.souza@TESTE.com', senha: SENHA }).expect(200);
      expect(r.body).toMatchObject({
        tipo: 'Bearer',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('o banco também recusa e-mail com maiúsculas (defesa em profundidade)', async () => {
      await expect(
        prisma.usuario.create({ data: { nome: 'X', email: 'MAIUSCULO@teste.com', senhaHash } }),
      ).rejects.toThrow();
    });

    it('senha fraca, e-mail inválido, nome curto e campos desconhecidos dão 400 com mensagens claras', async () => {
      const casos = [
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: '1234567' }, // curta
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: 'somenteletras' }, // sem número
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: '12345678901' }, // sem letra
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: 'a1'.repeat(40) }, // acima de 72 (limite do bcrypt)
        { nome: 'Bia Lima', email: 'nao-e-email', senha: SENHA },
        { nome: 'B', email: 'bia@teste.com', senha: SENHA },
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: SENHA, ativo: false }, // campo desconhecido
      ];
      for (const corpo of casos) await http.post('/v1/auth/registro').send(corpo).expect(400);
    });

    it('login com senha errada, e-mail inexistente ou conta desativada dá a MESMA resposta', async () => {
      const ativa = await criarUsuario('USER');
      const desativada = await criarUsuario('USER', false);
      const respostas = await Promise.all([
        http.post('/v1/auth/login').send({ email: ativa.email, senha: 'SenhaErrada1' }),
        http.post('/v1/auth/login').send({ email: 'ninguem@teste.com', senha: SENHA }),
        http.post('/v1/auth/login').send({ email: desativada.email, senha: SENHA }),
      ]);
      for (const r of respostas) expect(r.status).toBe(401);
      expect(new Set(respostas.map((r) => String(r.body.mensagem))).size).toBe(1);
    });

    it('GET /v1/auth/eu devolve o usuário do token', async () => {
      const pessoa = await criarUsuario('USER');
      const r = await http.get('/v1/auth/eu').set(auth(pessoa.token)).expect(200);
      expect(r.body).toMatchObject({ id: pessoa.id, email: pessoa.email, role: 'USER' });
    });
  });

  // =====================================================================================================
  describe('sessões: refresh token, troca de senha e desativação', () => {
    async function entrar() {
      const pessoa = await criarUsuario('USER');
      const r = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
      return { pessoa, tokens: r.body as { accessToken: string; refreshToken: string } };
    }

    it('o refresh token é guardado só como hash', async () => {
      const { tokens } = await entrar();
      expect(await prisma.refreshToken.count({ where: { tokenHash: tokens.refreshToken } })).toBe(0);
      expect(await prisma.refreshToken.count()).toBeGreaterThan(0);
    });

    it('renovar troca o par e o refresh token antigo morre (uso único)', async () => {
      const { tokens } = await entrar();
      const nova = await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(200);
      expect(nova.body.refreshToken).not.toBe(tokens.refreshToken);
      await http.get('/v1/auth/eu').set(auth(nova.body.accessToken)).expect(200);
      await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('REUSO de um refresh token já usado derruba TODAS as sessões (sinal de roubo)', async () => {
      const { tokens } = await entrar();
      const nova = await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(200);
      // alguém (o ladrão) apresenta o token antigo...
      await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(401);
      // ...e a sessão nova, inclusive a legítima, também deixa de renovar.
      await http.post('/v1/auth/renovar').send({ refreshToken: nova.body.refreshToken }).expect(401);
    });

    it('renovações SIMULTÂNEAS com o mesmo token: no máximo uma vence', async () => {
      const { tokens } = await entrar();
      const rs = await Promise.all(
        Array.from({ length: 8 }, () => http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken })),
      );
      expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    });

    it('sair invalida o refresh token (e sair de novo não dá erro)', async () => {
      const { tokens } = await entrar();
      await http.post('/v1/auth/sair').send({ refreshToken: tokens.refreshToken }).expect(204);
      await http.post('/v1/auth/sair').send({ refreshToken: tokens.refreshToken }).expect(204);
      await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('refresh token inventado, vazio ou gigante é recusado', async () => {
      await http
        .post('/v1/auth/renovar')
        .send({ refreshToken: 'x'.repeat(60) })
        .expect(401);
      await http.post('/v1/auth/renovar').send({ refreshToken: '' }).expect(400);
      await http
        .post('/v1/auth/renovar')
        .send({ refreshToken: 'x'.repeat(500) })
        .expect(400);
    });

    it('trocar a senha exige a atual, aplica a política e encerra todas as sessões', async () => {
      const { pessoa, tokens } = await entrar();
      const cab = auth(tokens.accessToken);

      await http
        .patch('/v1/auth/senha')
        .set(cab)
        .send({ senhaAtual: 'Errada12345', novaSenha: 'NovaSenha456' })
        .expect(422);
      await http.patch('/v1/auth/senha').set(cab).send({ senhaAtual: SENHA, novaSenha: 'curta1' }).expect(400);
      await http.patch('/v1/auth/senha').set(cab).send({ senhaAtual: SENHA, novaSenha: SENHA }).expect(400);

      await http.patch('/v1/auth/senha').set(cab).send({ senhaAtual: SENHA, novaSenha: 'NovaSenha456' }).expect(204);

      await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(401); // sessão encerrada
      await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(401); // senha antiga
      await http.post('/v1/auth/login').send({ email: pessoa.email, senha: 'NovaSenha456' }).expect(200);
    });

    it('DESATIVAR a conta derruba o acesso NA HORA, mesmo com token ainda dentro da validade', async () => {
      const admin = await criarUsuario('ADMIN');
      const { pessoa, tokens } = await entrar();
      await http.get('/v1/auth/eu').set(auth(tokens.accessToken)).expect(200);

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);

      await http.get('/v1/auth/eu').set(auth(tokens.accessToken)).expect(401); // o JWT ainda não expirou, mas a conta sim
      await http.post('/v1/auth/renovar').send({ refreshToken: tokens.refreshToken }).expect(401);
      await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(401);

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ ativo: true }).expect(200);
      await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
    });
  });

  // =====================================================================================================
  describe('limite de requisições', () => {
    it('mais de 5 logins por minuto devolvem 429', async () => {
      const pessoa = await criarUsuario('USER');
      const tentativas: number[] = [];
      for (let i = 0; i < 7; i++)
        tentativas.push((await http.post('/v1/auth/login').send({ email: pessoa.email, senha: 'Errada12345' })).status);
      expect(tentativas.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(tentativas.slice(5)).toEqual([429, 429]);
    });

    it('o cadastro também tem limite (10 por hora): contas em massa são barradas', async () => {
      const status: number[] = [];
      for (let i = 0; i < 12; i++) {
        status.push(
          (
            await http
              .post('/v1/auth/registro')
              .send({ nome: `Massa ${i}`, email: `massa${i}@teste.com`, senha: SENHA })
          ).status,
        );
      }
      expect(status.filter((s) => s === 201)).toHaveLength(10);
      expect(status.slice(10)).toEqual([429, 429]);
    });
  });

  // =====================================================================================================
  describe('equipamentos', () => {
    it('só ADMIN cadastra e edita; qualquer logado lista e consulta', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');

      await http.post('/v1/equipamentos').set(auth(pessoa.token)).send({ nome: 'Projetor' }).expect(403);
      const criado = await http
        .post('/v1/equipamentos')
        .set(auth(admin.token))
        .send({ nome: '  Projetor Epson  ', descricao: 'Sala 2' })
        .expect(201);
      expect(criado.body).toMatchObject({ nome: 'Projetor Epson', ativo: true, emprestado: false, disponivel: true });

      await http.get(`/v1/equipamentos/${criado.body.id}`).set(auth(pessoa.token)).expect(200);
      await http
        .patch(`/v1/equipamentos/${criado.body.id}`)
        .set(auth(pessoa.token))
        .send({ nome: 'Outro' })
        .expect(403);
      const editado = await http
        .patch(`/v1/equipamentos/${criado.body.id}`)
        .set(auth(admin.token))
        .send({ nome: 'Projetor Epson X1' })
        .expect(200);
      expect(editado.body.nome).toBe('Projetor Epson X1');
    });

    it('validação: nome vazio, nome gigante e campos desconhecidos dão 400; id inexistente dá 404', async () => {
      const admin = await criarUsuario('ADMIN');
      const cab = auth(admin.token);
      await http.post('/v1/equipamentos').set(cab).send({ nome: '   ' }).expect(400);
      await http
        .post('/v1/equipamentos')
        .set(cab)
        .send({ nome: 'x'.repeat(121) })
        .expect(400);
      await http.post('/v1/equipamentos').set(cab).send({ nome: 'Ok', emprestado: true }).expect(400);
      await http.get('/v1/equipamentos/999999').set(cab).expect(404);
      await http.get('/v1/equipamentos/abc').set(cab).expect(400);
    });

    it('listagem: paginação estável com metadados, filtros e limites', async () => {
      const pessoa = await criarUsuario('USER');
      await prisma.equipamento.deleteMany();
      await prisma.equipamento.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          nome: `Item ${String(i + 1).padStart(2, '0')}`,
          ativo: i % 5 !== 0,
        })),
      });

      const p1 = await http.get('/v1/equipamentos?pagina=1&limite=10').set(auth(pessoa.token)).expect(200);
      const p2 = await http.get('/v1/equipamentos?pagina=2&limite=10').set(auth(pessoa.token)).expect(200);
      const p3 = await http.get('/v1/equipamentos?pagina=3&limite=10').set(auth(pessoa.token)).expect(200);
      expect(p1.body.meta).toEqual({ total: 25, pagina: 1, limite: 10, totalPaginas: 3 });
      expect([p1.body.itens.length, p2.body.itens.length, p3.body.itens.length]).toEqual([10, 10, 5]);

      const ids = [...p1.body.itens, ...p2.body.itens, ...p3.body.itens].map((e: { id: number }) => e.id);
      expect(new Set(ids).size).toBe(25); // nenhum item repetido ou perdido entre páginas
      expect(ids).toEqual([...ids].sort((a, b) => a - b)); // ordem estável por id

      const inativos = await http.get('/v1/equipamentos?ativo=false&limite=100').set(auth(pessoa.token)).expect(200);
      expect(inativos.body.meta.total).toBe(5);
      const busca = await http.get('/v1/equipamentos?busca=item 07').set(auth(pessoa.token)).expect(200);
      expect(busca.body.itens.map((e: { nome: string }) => e.nome)).toEqual(['Item 07']);

      await http.get('/v1/equipamentos?limite=101').set(auth(pessoa.token)).expect(400);
      await http.get('/v1/equipamentos?pagina=0').set(auth(pessoa.token)).expect(400);
      await http.get('/v1/equipamentos?ativo=talvez').set(auth(pessoa.token)).expect(400);
    });
  });

  // =====================================================================================================
  describe('empréstimos', () => {
    it('retirada e devolução: fluxo completo, com prazo e dono', async () => {
      const dono = await criarUsuario('USER');
      const equip = await criarEquipamento();

      const r = await http
        .post('/v1/emprestimos')
        .set(auth(dono.token))
        .send({ equipamentoId: equip.id, dias: 3 })
        .expect(201);
      expect(r.body).toMatchObject({ status: 'ATIVO', atrasado: false, dataDevolucao: null });
      expect(r.body.equipamento.id).toBe(equip.id);
      const dias = (new Date(r.body.prazoDevolucao).getTime() - new Date(r.body.dataRetirada).getTime()) / 86_400_000;
      expect(Math.round(dias)).toBe(3);

      const lista = await http.get('/v1/equipamentos?emprestado=true&limite=100').set(auth(dono.token)).expect(200);
      expect(lista.body.itens.map((e: { id: number }) => e.id)).toContain(equip.id);
      expect((await http.get(`/v1/equipamentos/${equip.id}`).set(auth(dono.token))).body).toMatchObject({
        emprestado: true,
        disponivel: false,
      });

      const devolvido = await http.patch(`/v1/emprestimos/${r.body.id}/devolucao`).set(auth(dono.token)).expect(200);
      expect(devolvido.body).toMatchObject({ status: 'DEVOLVIDO', atrasado: false });
      expect(devolvido.body.dataDevolucao).toEqual(expect.any(String));
      expect((await http.get(`/v1/equipamentos/${equip.id}`).set(auth(dono.token))).body).toMatchObject({
        emprestado: false,
        disponivel: true,
      });
    });

    it('regras da retirada: inexistente 404, fora de uso 409, já emprestado 409, prazo inválido 400', async () => {
      const a = await criarUsuario('USER');
      const b = await criarUsuario('USER');
      const livre = await criarEquipamento();
      const foraDeUso = await criarEquipamento('Quebrado', false);

      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: 999999 }).expect(404);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: foraDeUso.id }).expect(409);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: livre.id }).expect(201);
      await http.post('/v1/emprestimos').set(auth(b.token)).send({ equipamentoId: livre.id }).expect(409);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: livre.id }).expect(409); // nem a mesma pessoa

      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: 0 }).expect(400);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: 'x' }).expect(400);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: livre.id, dias: 31 }).expect(400);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: livre.id, dias: 0 }).expect(400);
      await http
        .post('/v1/emprestimos')
        .set(auth(a.token))
        .send({ equipamentoId: livre.id, usuarioId: 99 })
        .expect(400); // não aceita "em nome de"
    });

    it('devolução: só o dono ou um ADMIN; devolver duas vezes dá 409; inexistente 404', async () => {
      const dono = await criarUsuario('USER');
      const intruso = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const equip = await criarEquipamento();
      const emp = (
        await http.post('/v1/emprestimos').set(auth(dono.token)).send({ equipamentoId: equip.id }).expect(201)
      ).body;

      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(intruso.token)).expect(403);
      await http.patch(`/v1/emprestimos/999999/devolucao`).set(auth(dono.token)).expect(404);
      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(admin.token)).expect(200); // admin pode
      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(dono.token)).expect(409);
    });

    it('listas: "meus" só traz os do próprio usuário; status inválido dá 400; admin vê tudo com filtros', async () => {
      const a = await criarUsuario('USER');
      const b = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const e1 = await criarEquipamento();
      const e2 = await criarEquipamento();
      const e3 = await criarEquipamento();
      const dev = (await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: e1.id })).body;
      await http.patch(`/v1/emprestimos/${dev.id}/devolucao`).set(auth(a.token)).expect(200);
      await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: e2.id }).expect(201);
      await http.post('/v1/emprestimos').set(auth(b.token)).send({ equipamentoId: e3.id }).expect(201);

      const meus = await http.get('/v1/emprestimos/meus').set(auth(a.token)).expect(200);
      expect(meus.body.meta.total).toBe(2);
      expect(meus.body.itens.every((e: { usuario: { id: number } }) => e.usuario.id === a.id)).toBe(true);
      expect(meus.body.itens[0].id).toBeGreaterThan(meus.body.itens[1].id); // mais recente primeiro

      const soAtivos = await http.get('/v1/emprestimos/meus?status=ATIVO').set(auth(a.token)).expect(200);
      expect(soAtivos.body.meta.total).toBe(1);
      await http.get('/v1/emprestimos/meus?status=QUALQUER').set(auth(a.token)).expect(400);

      await http.get('/v1/emprestimos').set(auth(a.token)).expect(403);
      const todos = await http.get(`/v1/emprestimos?equipamentoId=${e2.id}`).set(auth(admin.token)).expect(200);
      expect(todos.body.meta.total).toBe(1);
      const dePessoa = await http.get(`/v1/emprestimos?usuarioId=${b.id}`).set(auth(admin.token)).expect(200);
      expect(dePessoa.body.itens[0].usuario.email).toBe(b.email);
      expect(JSON.stringify(dePessoa.body)).not.toMatch(/senha|hash/i);
    });

    it('atraso: ativo com prazo vencido aparece como atrasado e no filtro "atrasados"', async () => {
      const pessoa = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const equip = await criarEquipamento();
      const emp = (
        await http
          .post('/v1/emprestimos')
          .set(auth(pessoa.token))
          .send({ equipamentoId: equip.id, dias: 1 })
          .expect(201)
      ).body;
      expect((await http.get('/v1/emprestimos/meus?atrasados=true').set(auth(pessoa.token))).body.meta.total).toBe(0);

      await prisma.emprestimo.update({
        where: { id: emp.id },
        data: { prazoDevolucao: new Date(Date.now() - 3_600_000) },
      });
      const atrasados = await http.get('/v1/emprestimos?atrasados=true').set(auth(admin.token)).expect(200);
      expect(atrasados.body.itens.map((e: { id: number }) => e.id)).toContain(emp.id);
      expect(atrasados.body.itens.find((e: { id: number }) => e.id === emp.id).atrasado).toBe(true);

      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(pessoa.token)).expect(200);
      expect(
        (await http.get('/v1/emprestimos?atrasados=true').set(auth(admin.token))).body.itens.map(
          (e: { id: number }) => e.id,
        ),
      ).not.toContain(emp.id);
    });

    it('não é possível desativar um equipamento emprestado; depois da devolução, é', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      const equip = await criarEquipamento();
      const emp = (
        await http.post('/v1/emprestimos').set(auth(pessoa.token)).send({ equipamentoId: equip.id }).expect(201)
      ).body;

      await http.patch(`/v1/equipamentos/${equip.id}`).set(auth(admin.token)).send({ ativo: false }).expect(409);
      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(pessoa.token)).expect(200);
      const r = await http
        .patch(`/v1/equipamentos/${equip.id}`)
        .set(auth(admin.token))
        .send({ ativo: false })
        .expect(200);
      expect(r.body).toMatchObject({ ativo: false, disponivel: false });
      await http.post('/v1/emprestimos').set(auth(pessoa.token)).send({ equipamentoId: equip.id }).expect(409);
    });
  });

  // =====================================================================================================
  describe('FALHAS CORRIGIDAS 2 e 3: concorrência (as corridas da auditoria)', () => {
    it('30 retiradas SIMULTÂNEAS do mesmo equipamento: exatamente 1 vence', async () => {
      const equip = await criarEquipamento('Item disputado');
      const pessoas = await Promise.all(Array.from({ length: 30 }, () => criarUsuario('USER')));

      const respostas = await Promise.all(
        pessoas.map((p) => http.post('/v1/emprestimos').set(auth(p.token)).send({ equipamentoId: equip.id })),
      );

      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(29);
      expect(await prisma.emprestimo.count({ where: { equipamentoId: equip.id, status: 'ATIVO' } })).toBe(1);
    });

    it('repetido várias vezes (a falha original aparecia só às vezes)', async () => {
      for (let rodada = 0; rodada < 5; rodada++) {
        const equip = await criarEquipamento(`Rodada ${rodada}`);
        const pessoas = await Promise.all(Array.from({ length: 20 }, () => criarUsuario('USER')));
        const rs = await Promise.all(
          pessoas.map((p) => http.post('/v1/emprestimos').set(auth(p.token)).send({ equipamentoId: equip.id })),
        );
        expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      }
    });

    it('retiradas simultâneas de equipamentos DIFERENTES não se bloqueiam: todas dão certo', async () => {
      const pessoas = await Promise.all(Array.from({ length: 15 }, () => criarUsuario('USER')));
      const equips = await Promise.all(pessoas.map(() => criarEquipamento()));
      const rs = await Promise.all(
        pessoas.map((p, i) => http.post('/v1/emprestimos').set(auth(p.token)).send({ equipamentoId: equips[i].id })),
      );
      expect(rs.every((r) => r.status === 201)).toBe(true);
    });

    it('5 devoluções simultâneas do mesmo empréstimo: 1 vence e 4 recebem 409', async () => {
      const dono = await criarUsuario('USER');
      const equip = await criarEquipamento();
      const emp = (
        await http.post('/v1/emprestimos').set(auth(dono.token)).send({ equipamentoId: equip.id }).expect(201)
      ).body;

      const rs = await Promise.all(
        Array.from({ length: 5 }, () => http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(dono.token))),
      );
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('retirada x desativação simultâneas: nunca sobra equipamento desativado E emprestado', async () => {
      const admin = await criarUsuario('ADMIN');
      for (let i = 0; i < 8; i++) {
        const equip = await criarEquipamento();
        const pessoa = await criarUsuario('USER');
        await Promise.all([
          http.post('/v1/emprestimos').set(auth(pessoa.token)).send({ equipamentoId: equip.id }),
          http.patch(`/v1/equipamentos/${equip.id}`).set(auth(admin.token)).send({ ativo: false }),
        ]);
        const depois = await prisma.equipamento.findUniqueOrThrow({ where: { id: equip.id } });
        const ativos = await prisma.emprestimo.count({ where: { equipamentoId: equip.id, status: 'ATIVO' } });
        expect(!depois.ativo && ativos > 0).toBe(false);
      }
    });

    it('a garantia vale no BANCO: nem um INSERT direto cria um segundo empréstimo ativo', async () => {
      const pessoa = await criarUsuario('USER');
      const equip = await criarEquipamento();
      const dados = {
        usuarioId: pessoa.id,
        equipamentoId: equip.id,
        prazoDevolucao: new Date(Date.now() + 86_400_000),
      };
      await prisma.emprestimo.create({ data: dados });
      await expect(prisma.emprestimo.create({ data: dados })).rejects.toThrow(); // índice único parcial
      await prisma.emprestimo.create({ data: { ...dados, status: 'DEVOLVIDO' } }); // histórico devolvido pode repetir
    });
  });
});
