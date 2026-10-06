// Testes de integração: sobem a API inteira (mesma configuração da produção: versão, validação, filtros)
// contra um PostgreSQL de TESTE e chamam as rotas de verdade por HTTP.
// Cobrem o que testes unitários não alcançam: permissões, integridade sob concorrência e sessões.

// O ambiente precisa estar pronto ANTES de a aplicação ser importada (a configuração é lida na importação).
process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';
process.env.NODE_ENV = 'test';
process.env.METRICAS_TOKEN = 'token-de-metricas-de-teste';
process.env.NOTIFICACOES_ATIVAS = 'false'; // os avisos são disparados à mão nos testes, nunca pelo relógio
process.env.BCRYPT_CUSTO = '4'; // rápido nos testes; em produção o padrão é 12
delete process.env.CORS_ORIGENS;

import { AddressInfo } from 'node:net';
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
  // E-mails "enviados" pela aplicação (o envio real é substituído por este registro)
  const emails: { para: string; assunto: string; texto: string }[] = [];

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
    const { EmailService } = await import('../src/email/email.service.js');

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ enviar: (m: (typeof emails)[number]) => Promise.resolve(void emails.push(m)) })
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    // A aplicação ESCUTA de verdade em uma porta livre. Sem isso o supertest abre um servidor temporário por
    // requisição, e dezenas de pedidos simultâneos (testes de concorrência) se atropelam com ECONNRESET no Linux.
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    http = request(`http://127.0.0.1:${port}`);
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
      const invalido = await http.post('/v1/auth/login').set('X-Tipo-Cliente', 'api').send({ email: 'x' }).expect(400);
      expect(invalido.body).toMatchObject({ statusCode: 400, erro: 'Requisição inválida' });
      expect(Array.isArray(invalido.body.mensagem)).toBe(true); // uma mensagem por campo inválido
    });
  });

  // =====================================================================================================
  describe('FALHA CORRIGIDA 1: ninguém vira ADMIN pelo cadastro público', () => {
    it('cadastro cria sempre um USER e nunca devolve a senha', async () => {
      const r = await http
        .post('/v1/auth/registro')
        .send({ nome: 'Maria Silva', email: 'maria@teste.com', senha: SENHA, aceitoPolitica: true })
        .expect(201);
      expect(r.body).toMatchObject({ nome: 'Maria Silva', email: 'maria@teste.com', role: 'USER', ativo: true });
      expect(JSON.stringify(r.body)).not.toMatch(/senha|hash/i);
    });

    it('enviar role=ADMIN no cadastro é recusado (400) e NÃO cria a conta', async () => {
      const r = await http
        .post('/v1/auth/registro')
        .send({ nome: 'Atacante', email: 'atacante@teste.com', senha: SENHA, role: 'ADMIN', aceitoPolitica: true })
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
        .send({ nome: 'Ana Souza', email: 'Ana.Souza@Teste.com ', senha: SENHA, aceitoPolitica: true })
        .expect(201);
      await http
        .post('/v1/auth/registro')
        .send({ nome: 'Ana Dois', email: 'ANA.SOUZA@teste.com', senha: SENHA, aceitoPolitica: true })
        .expect(409);
      const r = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: 'ANA.souza@TESTE.com', senha: SENHA })
        .expect(200);
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
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: '1234567', aceitoPolitica: true }, // curta
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: 'somenteletras', aceitoPolitica: true }, // sem número
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: '12345678901', aceitoPolitica: true }, // sem letra
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: 'a1'.repeat(40), aceitoPolitica: true }, // acima de 72 (limite do bcrypt)
        { nome: 'Bia Lima', email: 'nao-e-email', senha: SENHA, aceitoPolitica: true },
        { nome: 'B', email: 'bia@teste.com', senha: SENHA, aceitoPolitica: true },
        { nome: 'Bia Lima', email: 'bia@teste.com', senha: SENHA, ativo: false, aceitoPolitica: true }, // campo desconhecido
      ];
      for (const corpo of casos) await http.post('/v1/auth/registro').send(corpo).expect(400);
    });

    it('o aceite da Política de Privacidade é obrigatório e fica registrado (quando e qual versão)', async () => {
      const base = { nome: 'Dora Aceite', email: 'dora@teste.com', senha: SENHA };
      for (const corpo of [base, { ...base, aceitoPolitica: false }, { ...base, aceitoPolitica: 'true' }]) {
        const r = await http.post('/v1/auth/registro').send(corpo).expect(400);
        expect(JSON.stringify(r.body.mensagem)).toContain('Política de Privacidade');
      }
      expect(await prisma.usuario.count({ where: { email: 'dora@teste.com' } })).toBe(0); // nada foi criado

      await http
        .post('/v1/auth/registro')
        .send({ ...base, aceitoPolitica: true })
        .expect(201);
      const salvo = await prisma.usuario.findUniqueOrThrow({ where: { email: 'dora@teste.com' } });
      expect(salvo.politicaVersao).toBe('0.1-modelo');
      expect(Date.now() - (salvo.politicaAceitaEm?.getTime() ?? 0)).toBeLessThan(10_000);
    });

    it('login com senha errada, e-mail inexistente ou conta desativada dá a MESMA resposta', async () => {
      const ativa = await criarUsuario('USER');
      const desativada = await criarUsuario('USER', false);
      const respostas = await Promise.all([
        http.post('/v1/auth/login').set('X-Tipo-Cliente', 'api').send({ email: ativa.email, senha: 'SenhaErrada1' }),
        http.post('/v1/auth/login').set('X-Tipo-Cliente', 'api').send({ email: 'ninguem@teste.com', senha: SENHA }),
        http.post('/v1/auth/login').set('X-Tipo-Cliente', 'api').send({ email: desativada.email, senha: SENHA }),
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
      const r = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
      return { pessoa, tokens: r.body as { accessToken: string; refreshToken: string } };
    }

    it('o refresh token é guardado só como hash', async () => {
      const { tokens } = await entrar();
      expect(await prisma.refreshToken.count({ where: { tokenHash: tokens.refreshToken } })).toBe(0);
      expect(await prisma.refreshToken.count()).toBeGreaterThan(0);
    });

    it('renovar troca o par e o refresh token antigo morre (uso único)', async () => {
      const { tokens } = await entrar();
      const nova = await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(nova.body.refreshToken).not.toBe(tokens.refreshToken);
      await http.get('/v1/auth/eu').set(auth(nova.body.accessToken)).expect(200);
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('REUSO de um refresh token já usado derruba TODAS as sessões (sinal de roubo)', async () => {
      const { tokens } = await entrar();
      const nova = await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      // alguém (o ladrão) apresenta o token antigo...
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      // ...e a sessão nova, inclusive a legítima, também deixa de renovar.
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: nova.body.refreshToken })
        .expect(401);
    });

    it('renovações SIMULTÂNEAS com o mesmo token: no máximo uma vence', async () => {
      const { tokens } = await entrar();
      const rs = await Promise.all(
        Array.from({ length: 8 }, () =>
          http.post('/v1/auth/renovar').set('X-Tipo-Cliente', 'api').send({ refreshToken: tokens.refreshToken }),
        ),
      );
      expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    });

    it('sair invalida o refresh token (e sair de novo não dá erro)', async () => {
      const { tokens } = await entrar();
      await http.post('/v1/auth/sair').send({ refreshToken: tokens.refreshToken }).expect(204);
      await http.post('/v1/auth/sair').send({ refreshToken: tokens.refreshToken }).expect(204);
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('refresh token inventado, vazio ou gigante é recusado', async () => {
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: 'x'.repeat(60) })
        .expect(401);
      await http.post('/v1/auth/renovar').set('X-Tipo-Cliente', 'api').send({ refreshToken: '' }).expect(400);
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
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

      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401); // sessão encerrada
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(401); // senha antiga
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: 'NovaSenha456' })
        .expect(200);
    });

    it('DESATIVAR a conta derruba o acesso NA HORA, mesmo com token ainda dentro da validade', async () => {
      const admin = await criarUsuario('ADMIN');
      const { pessoa, tokens } = await entrar();
      await http.get('/v1/auth/eu').set(auth(tokens.accessToken)).expect(200);

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);

      await http.get('/v1/auth/eu').set(auth(tokens.accessToken)).expect(401); // o JWT ainda não expirou, mas a conta sim
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(401);

      await http.patch(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).send({ ativo: true }).expect(200);
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
    });
  });

  // =====================================================================================================
  describe('perfil: edição dos próprios dados', () => {
    const PNG =
      'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

    it('edita dados pessoais, guarda só dígitos e devolve o perfil atualizado', async () => {
      const pessoa = await criarUsuario('USER');
      const r = await http
        .patch('/v1/auth/eu')
        .set(auth(pessoa.token))
        .send({
          nome: 'Novo Nome',
          cpf: '529.982.247-25',
          telefone: '(11) 98765-4321',
          cep: '01310-100',
          uf: 'sp',
          avatar: 'animal:gato',
        })
        .expect(200);
      expect(r.body).toMatchObject({
        nome: 'Novo Nome',
        cpf: '52998224725',
        telefone: '11987654321',
        cep: '01310100',
        uf: 'SP',
        avatar: 'animal:gato',
        role: 'USER',
      });
      expect(r.body.senhaHash).toBeUndefined();
      const eu = await http.get('/v1/auth/eu').set(auth(pessoa.token)).expect(200);
      expect(eu.body.cpf).toBe('52998224725');
    });

    it('papel e situação da conta NÃO são editáveis pelo perfil', async () => {
      const pessoa = await criarUsuario('USER');
      for (const corpo of [{ role: 'ADMIN' }, { ativo: false }, { senhaHash: 'x' }]) {
        await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send(corpo).expect(400);
      }
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: pessoa.id } })).role).toBe('USER');
    });

    it('recusa CPF inválido, telefone e CEP malformados', async () => {
      const pessoa = await criarUsuario('USER');
      for (const corpo of [{ cpf: '111.111.111-11' }, { telefone: '123' }, { cep: '123' }, { uf: 'SPX' }]) {
        await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send(corpo).expect(400);
      }
    });

    it('CPF e e-mail não podem pertencer a duas contas (409)', async () => {
      const a = await criarUsuario('USER');
      const b = await criarUsuario('USER');
      await http.patch('/v1/auth/eu').set(auth(a.token)).send({ cpf: '11144477735' }).expect(200);
      await http.patch('/v1/auth/eu').set(auth(b.token)).send({ cpf: '111.444.777-35' }).expect(409);
      await http.patch('/v1/auth/eu').set(auth(b.token)).send({ email: a.email.toUpperCase() }).expect(409);
    });

    it('avatar: aceita acervo e imagem real; recusa SVG, HTML disfarçado e tamanho absurdo', async () => {
      const pessoa = await criarUsuario('USER');
      await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send({ avatar: PNG }).expect(200);
      const invalidos = [
        'animal:unicornio',
        'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
        'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'),
        'https://exemplo.com/foto.png',
        'data:image/png;base64,' + 'A'.repeat(90_000),
      ];
      for (const avatar of invalidos) {
        await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send({ avatar }).expect(400);
      }
      const r = await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send({ avatar: null }).expect(200);
      expect(r.body.avatar).toBeNull();
    });

    it('texto vazio apaga um campo opcional', async () => {
      const pessoa = await criarUsuario('USER');
      await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send({ cidade: 'Recife' }).expect(200);
      const r = await http.patch('/v1/auth/eu').set(auth(pessoa.token)).send({ cidade: '' }).expect(200);
      expect(r.body.cidade).toBeNull();
    });

    it('sem token devolve 401', async () => {
      await http.patch('/v1/auth/eu').send({ nome: 'X' }).expect(401);
    });
  });

  // =====================================================================================================
  describe('painel (dashboard)', () => {
    const DIA = 86_400_000;

    // Outros testes limpam a tabela de equipamentos: não deixa empréstimos pendurados neles
    afterAll(async () => {
      await prisma.emprestimo.deleteMany();
    });

    it('exige login e valida o período (7 a 90 dias)', async () => {
      await http.get('/v1/dashboard/resumo').expect(401);
      const admin = await criarUsuario('ADMIN');
      for (const dias of ['3', '91', 'abc']) {
        await http.get(`/v1/dashboard/resumo?dias=${dias}`).set(auth(admin.token)).expect(400);
      }
      await http.get('/v1/dashboard/resumo?dias=7').set(auth(admin.token)).expect(200);
    });

    it('usuário comum vê só os PRÓPRIOS empréstimos; o acervo é global', async () => {
      const pessoa = await criarUsuario('USER');
      const outra = await criarUsuario('USER');
      const equipA = await criarEquipamento();
      const equipB = await criarEquipamento();
      const agora = Date.now();
      // da pessoa: um em andamento e já ATRASADO, e um devolvido no prazo
      await prisma.emprestimo.create({
        data: {
          usuarioId: pessoa.id,
          equipamentoId: equipA.id,
          dataRetirada: new Date(agora - 10 * DIA),
          prazoDevolucao: new Date(agora - 3 * DIA),
        },
      });
      await prisma.emprestimo.create({
        data: {
          usuarioId: pessoa.id,
          equipamentoId: equipB.id,
          status: 'DEVOLVIDO',
          dataRetirada: new Date(agora - 6 * DIA),
          prazoDevolucao: new Date(agora - 1 * DIA),
          dataDevolucao: new Date(agora - 2 * DIA),
        },
      });
      // de OUTRA pessoa: não pode aparecer no painel desta
      await prisma.emprestimo.create({
        data: {
          usuarioId: outra.id,
          equipamentoId: (await criarEquipamento()).id,
          dataRetirada: new Date(agora - 2 * DIA),
          prazoDevolucao: new Date(agora + 5 * DIA),
        },
      });

      const r = await http.get('/v1/dashboard/resumo?dias=30').set(auth(pessoa.token)).expect(200);
      expect(r.body.escopo).toBe('pessoal');
      expect(r.body.kpis).toMatchObject({
        emprestimosAtivos: 1,
        atrasados: 1,
        retiradasNoPeriodo: 2,
        devolvidosNoPeriodo: 1,
        pontualidade: 100,
      });
      expect(r.body.atrasados).toHaveLength(1);
      expect(r.body.atrasados[0]).toMatchObject({ equipamento: equipA.nome, pessoa: pessoa.nome });
      expect(r.body.atrasados[0].diasDeAtraso).toBeGreaterThanOrEqual(2);
      expect(r.body.pessoasMaisAtivas).toEqual([]); // ranking de pessoas é só do ADMIN
      expect(r.body.kpis.equipamentosAtivos).toBeGreaterThanOrEqual(3); // acervo global
    });

    it('ADMIN vê o sistema todo, e a série diária fecha com os totais do período', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      const equip = await criarEquipamento();
      await prisma.emprestimo.create({
        data: {
          usuarioId: pessoa.id,
          equipamentoId: equip.id,
          dataRetirada: new Date(Date.now() - 1 * DIA),
          prazoDevolucao: new Date(Date.now() + 6 * DIA),
        },
      });

      const r = await http.get('/v1/dashboard/resumo?dias=14').set(auth(admin.token)).expect(200);
      expect(r.body.escopo).toBe('geral');
      expect(r.body.serie).toHaveLength(14);
      const dias = r.body.serie.map((p: { dia: string }) => p.dia);
      expect([...dias].sort()).toEqual(dias); // do mais antigo ao mais recente
      expect(new Set(dias).size).toBe(14); // um ponto por dia, sem repetir
      const serie = r.body.serie as { retiradas: number; devolucoes: number }[];
      const soma = (campo: 'retiradas' | 'devolucoes') => serie.reduce((total, ponto) => total + ponto[campo], 0);
      expect(soma('retiradas')).toBe(r.body.kpis.retiradasNoPeriodo);
      expect(soma('devolucoes')).toBe(r.body.kpis.devolvidosNoPeriodo);
      expect(r.body.kpis.emprestimosAtivos).toBeGreaterThanOrEqual(1);
      expect(r.body.kpis.disponiveis + r.body.kpis.emprestados).toBe(r.body.kpis.equipamentosAtivos);
      expect(r.body.pessoasMaisAtivas.length).toBeGreaterThan(0);
      expect(r.body.maisEmprestados.length).toBeGreaterThan(0);
    });
  });

  // =====================================================================================================
  describe('recuperação de senha por e-mail', () => {
    const pedir = (email: string) => http.post('/v1/auth/esqueci-senha').send({ email });
    const redefinir = (token: string, novaSenha: string) =>
      http.post('/v1/auth/redefinir-senha').send({ token, novaSenha });
    const doUsuario = (email: string) => emails.filter((e) => e.para === email);
    const aguardar = (ms = 150) => new Promise((r) => setTimeout(r, ms)); // o envio roda em segundo plano
    const tokenDoEmail = (email: string) => {
      const ultimo = doUsuario(email)
        .filter((e) => e.assunto === 'Redefinição de senha')
        .pop();
      return /redefinir-senha\?token=([\w-]+)/.exec(ultimo?.texto ?? '')?.[1] ?? '';
    };

    it('a resposta é IDÊNTICA para e-mail cadastrado e não cadastrado, e só o cadastrado recebe o e-mail', async () => {
      const pessoa = await criarUsuario('USER');
      const existente = await pedir(pessoa.email);
      const inexistente = await pedir('ninguem.por.aqui@teste.com');
      await aguardar();
      expect(existente.status).toBe(204);
      expect(inexistente.status).toBe(204);
      expect(existente.text).toBe(inexistente.text);
      expect(doUsuario(pessoa.email)).toHaveLength(1);
      expect(doUsuario('ninguem.por.aqui@teste.com')).toHaveLength(0);
    });

    it('conta DESATIVADA não recebe e-mail', async () => {
      const inativa = await criarUsuario('USER', false);
      await pedir(inativa.email).expect(204);
      await aguardar();
      expect(doUsuario(inativa.email)).toHaveLength(0);
    });

    it('fluxo completo: link do e-mail troca a senha, encerra as sessões e só vale uma vez', async () => {
      const pessoa = await criarUsuario('USER');
      const sessao = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);

      await pedir(pessoa.email).expect(204);
      await aguardar();
      const token = tokenDoEmail(pessoa.email);
      expect(token.length).toBeGreaterThanOrEqual(40);

      await redefinir(token, 'OutraSenha456').expect(204);
      await aguardar();

      // senha nova entra; a antiga não; a sessão que já existia foi encerrada
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: 'OutraSenha456' })
        .expect(200);
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(401);
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: sessao.body.refreshToken })
        .expect(401);

      // o link não funciona uma segunda vez, e a pessoa é avisada da troca
      const reuso = await redefinir(token, 'TerceiraSenha789').expect(400);
      expect(reuso.body.mensagem).toContain('inválido ou expirou');
      expect(doUsuario(pessoa.email).map((e) => e.assunto)).toContain('Sua senha foi alterada');
    });

    it('só o HASH do token é guardado: ler o banco não permite redefinir a senha de ninguém', async () => {
      const pessoa = await criarUsuario('USER');
      await pedir(pessoa.email).expect(204);
      await aguardar();
      const token = tokenDoEmail(pessoa.email);
      const [registro] = await prisma.recuperacaoSenha.findMany({ where: { usuarioId: pessoa.id } });
      expect(registro.tokenHash).not.toBe(token);
      expect(registro.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(registro)).not.toContain(token);
    });

    it('um pedido novo invalida o link anterior', async () => {
      const pessoa = await criarUsuario('USER');
      await pedir(pessoa.email).expect(204);
      await aguardar();
      const primeiro = tokenDoEmail(pessoa.email);
      await pedir(pessoa.email).expect(204);
      await aguardar();
      const segundo = tokenDoEmail(pessoa.email);
      expect(segundo).not.toBe(primeiro);

      await redefinir(primeiro, 'OutraSenha456').expect(400);
      await redefinir(segundo, 'OutraSenha456').expect(204);
    });

    it('link expirado (30 minutos) é recusado e a senha continua a mesma', async () => {
      const pessoa = await criarUsuario('USER');
      await pedir(pessoa.email).expect(204);
      await aguardar();
      const token = tokenDoEmail(pessoa.email);
      await prisma.recuperacaoSenha.updateMany({
        where: { usuarioId: pessoa.id },
        data: { expiraEm: new Date(Date.now() - 1000) },
      });
      await redefinir(token, 'OutraSenha456').expect(400);
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
    });

    it('recusa senha fraca, código malformado e e-mail inválido (e a senha fraca não queima o link)', async () => {
      const pessoa = await criarUsuario('USER');
      await pedir(pessoa.email).expect(204);
      await aguardar();
      const token = tokenDoEmail(pessoa.email);

      await redefinir(token, 'curta').expect(400);
      await redefinir(token, 'somenteletrasaqui').expect(400);
      await redefinir('curto', 'OutraSenha456').expect(400);
      await redefinir('x'.repeat(43), 'OutraSenha456').expect(400); // código que nunca foi emitido
      await http.post('/v1/auth/esqueci-senha').send({ email: 'isto-nao-e-email' }).expect(400);
      await http.post('/v1/auth/esqueci-senha').send({}).expect(400);

      await redefinir(token, 'OutraSenha456').expect(204); // o link continua valendo
    });

    it('no máximo 3 pedidos por hora por conta: o excedente não manda mais e-mail (e a resposta não muda)', async () => {
      const pessoa = await criarUsuario('USER');
      for (let i = 0; i < 4; i++) {
        zerarLimites(); // o limite por IP não é o que está em teste aqui
        await pedir(pessoa.email).expect(204);
      }
      await aguardar();
      expect(doUsuario(pessoa.email).filter((e) => e.assunto === 'Redefinição de senha')).toHaveLength(3);
    });

    it('limite por IP: o 6º pedido na mesma hora recebe 429', async () => {
      const status: number[] = [];
      for (let i = 0; i < 7; i++) status.push((await pedir(`alguem${i}@teste.com`)).status);
      expect(status.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
      expect(status.slice(5)).toEqual([429, 429]);
    });

    it('as rotas são públicas (sem token) e ficam sob /v1', async () => {
      await http.post('/auth/esqueci-senha').send({ email: 'a@teste.com' }).expect(404);
      await http.post('/v1/auth/esqueci-senha').send({ email: 'a@teste.com' }).expect(204);
    });
  });

  // =====================================================================================================
  describe('avisos por e-mail (vencimento e atraso)', () => {
    const HORA = 3_600_000;
    const DIA = 24 * HORA;

    // Outros testes limpam a tabela de equipamentos: não deixa empréstimos pendurados neles
    afterAll(async () => {
      await prisma.emprestimo.deleteMany();
    });

    const executar = (token: string) => http.post('/v1/notificacoes/executar').set(auth(token));
    const assuntos = (email: string) => emails.filter((e) => e.para === email).map((e) => e.assunto);
    const emprestar = async (usuarioId: number, equipamento: string, prazo: Date, extra: object = {}) =>
      prisma.emprestimo.create({
        data: {
          usuarioId,
          equipamentoId: (await criarEquipamento(equipamento)).id,
          dataRetirada: new Date(Date.now() - 6 * DIA),
          prazoDevolucao: prazo,
          ...extra,
        },
      });

    it('só ADMIN dispara; sem login é 401 e usuário comum é 403', async () => {
      const comum = await criarUsuario('USER');
      await http.post('/v1/notificacoes/executar').expect(401);
      await executar(comum.token).expect(403);
    });

    it('lembra quem vence em até 24h, cobra quem atrasou e ignora o resto', async () => {
      const admin = await criarUsuario('ADMIN');
      const venceLogo = await criarUsuario('USER');
      const venceDepois = await criarUsuario('USER');
      const atrasada = await criarUsuario('USER');
      const quitou = await criarUsuario('USER');
      const agora = Date.now();

      await emprestar(venceLogo.id, 'Projetor Lembrete', new Date(agora + 10 * HORA));
      await emprestar(venceDepois.id, 'Câmera Longe', new Date(agora + 5 * DIA));
      await emprestar(atrasada.id, 'Notebook Atrasado', new Date(agora - 2 * DIA));
      await emprestar(quitou.id, 'Tablet Devolvido', new Date(agora - 2 * DIA), {
        status: 'DEVOLVIDO',
        dataDevolucao: new Date(agora - 3 * DIA),
      });

      const r = await executar(admin.token).expect(200);
      expect(r.body.lembretes).toBeGreaterThanOrEqual(1);
      expect(r.body.atrasos).toBeGreaterThanOrEqual(1);

      expect(assuntos(venceLogo.email)).toEqual([expect.stringContaining('Devolução de "Projetor Lembrete"')]);
      expect(assuntos(atrasada.email)).toEqual(['Empréstimo atrasado: "Notebook Atrasado"']);
      expect(assuntos(venceDepois.email)).toEqual([]); // ainda longe do prazo
      expect(assuntos(quitou.email)).toEqual([]); // já devolveu

      // o administrador recebe o resumo dos atrasos, com quem e o equipamento
      const resumo = emails.find((e) => e.para === admin.email && e.assunto.includes('atrasado'));
      expect(resumo?.texto).toContain('Notebook Atrasado');
      expect(resumo?.texto).toContain(atrasada.nome);
    });

    it('não repete: rodar de novo não manda nada; a cobrança volta só depois de 3 dias', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      const agora = Date.now();
      const lembrete = await emprestar(pessoa.id, 'Monitor Lembrete', new Date(agora + 5 * HORA));
      const atrasado = await emprestar(pessoa.id, 'Mic Atrasado', new Date(agora - 4 * DIA));

      await executar(admin.token).expect(200);
      const primeira = assuntos(pessoa.email).length;
      expect(primeira).toBe(2);

      await executar(admin.token).expect(200);
      expect(assuntos(pessoa.email)).toHaveLength(primeira); // nada novo

      // passaram 4 dias desde a última cobrança: cobra de novo o atrasado (o lembrete já saiu e não repete)
      await prisma.emprestimo.update({
        where: { id: atrasado.id },
        data: { ultimoAvisoAtrasoEm: new Date(agora - 4 * DIA) },
      });
      await executar(admin.token).expect(200);
      const todos = assuntos(pessoa.email);
      expect(todos).toHaveLength(primeira + 1);
      expect(todos.filter((a) => a.startsWith('Empréstimo atrasado'))).toHaveLength(2);
      expect(todos.filter((a) => a.startsWith('Devolução de'))).toHaveLength(1);
      expect(
        (await prisma.emprestimo.findUniqueOrThrow({ where: { id: lembrete.id } })).lembreteEnviadoEm,
      ).not.toBeNull();
    });

    it('conta desativada não recebe aviso', async () => {
      const admin = await criarUsuario('ADMIN');
      const inativa = await criarUsuario('USER', false);
      await emprestar(inativa.id, 'Item de Inativa', new Date(Date.now() - 3 * DIA));
      await executar(admin.token).expect(200);
      expect(assuntos(inativa.email)).toEqual([]);
    });

    it('duas rodadas SIMULTÂNEAS avisam a pessoa uma única vez (duas instâncias da API)', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      await emprestar(pessoa.id, 'Item Concorrente', new Date(Date.now() - 2 * DIA));
      await Promise.all([executar(admin.token), executar(admin.token), executar(admin.token)]);
      expect(assuntos(pessoa.email)).toHaveLength(1);
    });
  });

  // =====================================================================================================
  describe('auditoria de ações', () => {
    const aguardar = (ms = 200) => new Promise((r) => setTimeout(r, ms)); // o registro é gravado em segundo plano
    const registros = (atorId: number) =>
      prisma.registroAuditoria.findMany({ where: { atorId }, orderBy: { id: 'asc' } });

    // Outros testes limpam a tabela de equipamentos: não deixa empréstimos pendurados neles
    afterAll(async () => {
      await prisma.emprestimo.deleteMany();
    });

    it('administrador criando conta, mudando papel e desativando: tudo fica registrado, sem a senha', async () => {
      const admin = await criarUsuario('ADMIN');
      const criada = await http
        .post('/v1/usuarios')
        .set(auth(admin.token))
        .send({ nome: 'Pessoa Nova', email: 'pessoa.nova.auditoria@teste.com', senha: 'SenhaSecreta123', role: 'USER' })
        .expect(201);
      await http.patch(`/v1/usuarios/${criada.body.id}`).set(auth(admin.token)).send({ role: 'ADMIN' }).expect(200);
      await http.patch(`/v1/usuarios/${criada.body.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);
      await aguardar();

      const lista = await registros(admin.id);
      expect(lista.map((r) => r.acao)).toEqual(['USUARIO_CRIADO', 'PAPEL_ALTERADO', 'CONTA_DESATIVADA']);
      expect(lista.every((r) => r.entidade === 'usuario' && r.entidadeId === criada.body.id)).toBe(true);
      expect(lista[0].atorNome).toBe(admin.nome);
      expect(lista[0].detalhes).toMatchObject({ email: 'pessoa.nova.auditoria@teste.com', role: 'USER' });
      expect(JSON.stringify(lista)).not.toContain('SenhaSecreta123'); // senha nunca vai para a trilha
    });

    it('equipamento: criação, edição e desativação; operação que FALHA não deixa registro', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await criarUsuario('USER');
      const equip = await http
        .post('/v1/equipamentos')
        .set(auth(admin.token))
        .send({ nome: 'Roteador Auditado' })
        .expect(201);
      await http
        .patch(`/v1/equipamentos/${equip.body.id}`)
        .set(auth(admin.token))
        .send({ descricao: 'Novo texto' })
        .expect(200);
      await http.patch(`/v1/equipamentos/${equip.body.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);
      await http.patch(`/v1/equipamentos/${equip.body.id}`).set(auth(admin.token)).send({ ativo: true }).expect(200);

      // empresta e tenta desativar: 409, e isso NÃO é uma ação que aconteceu
      await http.post('/v1/emprestimos').set(auth(pessoa.token)).send({ equipamentoId: equip.body.id }).expect(201);
      await http.patch(`/v1/equipamentos/${equip.body.id}`).set(auth(admin.token)).send({ ativo: false }).expect(409);
      await http.patch('/v1/equipamentos/999999').set(auth(admin.token)).send({ nome: 'X' }).expect(404);
      await aguardar();

      expect((await registros(admin.id)).map((r) => r.acao)).toEqual([
        'EQUIPAMENTO_CRIADO',
        'EQUIPAMENTO_EDITADO',
        'EQUIPAMENTO_DESATIVADO',
        'EQUIPAMENTO_REATIVADO',
      ]);
    });

    it('troca de senha e reuso de refresh token (sessão suspeita) ficam registrados', async () => {
      const pessoa = await criarUsuario('USER');
      const sessao = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
      const renovada = await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: sessao.body.refreshToken })
        .expect(200);
      // apresentar de novo o token antigo (já usado) indica roubo
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: sessao.body.refreshToken })
        .expect(401);
      expect(renovada.body.refreshToken).toBeTruthy();

      const nova = await criarUsuario('USER');
      await http
        .patch('/v1/auth/senha')
        .set(auth(nova.token))
        .send({ senhaAtual: SENHA, novaSenha: 'OutraSenha456' })
        .expect(204);
      await aguardar();

      expect((await registros(pessoa.id)).map((r) => r.acao)).toContain('SESSAO_REUTILIZADA');
      const dela = await registros(nova.id);
      expect(dela.map((r) => r.acao)).toEqual(['SENHA_ALTERADA']);
      expect(dela[0].entidadeId).toBe(nova.id);
      expect(JSON.stringify(dela)).not.toContain('OutraSenha456');
    });

    it('administrador devolvendo o empréstimo de OUTRA pessoa é registrado; a pessoa devolvendo o seu, não', async () => {
      const admin = await criarUsuario('ADMIN');
      const a = await criarUsuario('USER');
      const b = await criarUsuario('USER');
      const equipA = await criarEquipamento();
      const equipB = await criarEquipamento();
      const ea = await http.post('/v1/emprestimos').set(auth(a.token)).send({ equipamentoId: equipA.id }).expect(201);
      const eb = await http.post('/v1/emprestimos').set(auth(b.token)).send({ equipamentoId: equipB.id }).expect(201);

      await http.patch(`/v1/emprestimos/${ea.body.id}/devolucao`).set(auth(admin.token)).expect(200); // em nome de outra pessoa
      await http.patch(`/v1/emprestimos/${eb.body.id}/devolucao`).set(auth(b.token)).expect(200); // a própria pessoa
      await aguardar();

      const doAdmin = await registros(admin.id);
      expect(doAdmin.map((r) => r.acao)).toEqual(['DEVOLUCAO_POR_ADMIN']);
      expect(doAdmin[0].detalhes).toMatchObject({ pessoaId: a.id });
      expect(await registros(b.id)).toHaveLength(0);
    });

    it('só ADMIN lê a trilha; lista do mais recente para o mais antigo, com filtros e paginação', async () => {
      const admin = await criarUsuario('ADMIN');
      const comum = await criarUsuario('USER');
      await http.get('/v1/auditoria').expect(401);
      await http.get('/v1/auditoria').set(auth(comum.token)).expect(403);

      for (let i = 0; i < 3; i++) {
        await http
          .post('/v1/equipamentos')
          .set(auth(admin.token))
          .send({ nome: `Item de trilha ${i}` })
          .expect(201);
      }
      await aguardar();

      const r = await http
        .get(`/v1/auditoria?atorId=${admin.id}&acao=EQUIPAMENTO_CRIADO&limite=2&pagina=1`)
        .set(auth(admin.token))
        .expect(200);
      expect(r.body.meta).toMatchObject({ total: 3, limite: 2, totalPaginas: 2 });
      expect(r.body.itens).toHaveLength(2);
      expect(r.body.itens[0].detalhes.nome).toBe('Item de trilha 2'); // o mais recente primeiro
      expect(r.body.itens.every((i: { atorNome: string }) => i.atorNome === admin.nome)).toBe(true);

      await http.get('/v1/auditoria?atorId=abc').set(auth(admin.token)).expect(400);
    });

    it('a trilha não deixa registrar nada sem login (rotas administrativas protegidas continuam protegidas)', async () => {
      const antes = await prisma.registroAuditoria.count();
      await http.post('/v1/equipamentos').send({ nome: 'Sem login' }).expect(401);
      await http.patch('/v1/usuarios/1').send({ role: 'ADMIN' }).expect(401);
      await aguardar();
      expect(await prisma.registroAuditoria.count()).toBe(antes);
    });
  });

  // =====================================================================================================
  describe('privacidade (LGPD)', () => {
    const aguardar = (ms = 200) => new Promise((r) => setTimeout(r, ms));

    // Outros testes limpam a tabela de equipamentos: não deixa empréstimos pendurados neles
    afterAll(async () => {
      await prisma.emprestimo.deleteMany();
    });

    // CPF é único por conta: cada pessoa de teste recebe um CPF válido diferente
    const gerarCpf = (n: number) => {
      const base = String(100_000_000 + n * 7_919_011).slice(0, 9);
      const digito = (digitos: string) => {
        let soma = 0;
        for (let i = 0; i < digitos.length; i++) soma += Number(digitos[i]) * (digitos.length + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
      };
      const d1 = digito(base);
      return `${base}${d1}${digito(base + d1)}`;
    };

    const comDados = async () => {
      const pessoa = await criarUsuario('USER');
      const cpf = gerarCpf(pessoa.id);
      await http
        .patch('/v1/auth/eu')
        .set(auth(pessoa.token))
        .send({
          cpf,
          telefone: '(21) 98888-7777',
          cep: '20040-020',
          logradouro: 'Rua da Assembleia',
          numero: '10',
          cidade: 'Rio de Janeiro',
          uf: 'RJ',
          avatar: 'animal:gato',
        })
        .expect(200);
      return { ...pessoa, cpf };
    };

    it('o administrador vê CPF e telefone MASCARADOS e sem endereço de rua; a própria pessoa vê tudo', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await comDados();

      const porId = await http.get(`/v1/usuarios/${pessoa.id}`).set(auth(admin.token)).expect(200);
      expect(porId.body).toMatchObject({
        cpf: `***.***.***-${pessoa.cpf.slice(9)}`,
        telefone: '(21) *****-7777',
        cidade: 'Rio de Janeiro',
        uf: 'RJ',
      });
      expect([porId.body.cep, porId.body.logradouro, porId.body.numero]).toEqual([null, null, null]);

      const lista = await http.get('/v1/usuarios?limite=100').set(auth(admin.token)).expect(200);
      const na_lista = lista.body.itens.find((u: { id: number }) => u.id === pessoa.id);
      expect(na_lista.cpf).toBe(`***.***.***-${pessoa.cpf.slice(9)}`);
      expect(JSON.stringify(lista.body)).not.toContain(pessoa.cpf); // o CPF inteiro não aparece em lugar nenhum

      const propria = await http.get('/v1/auth/eu').set(auth(pessoa.token)).expect(200);
      expect(propria.body).toMatchObject({
        cpf: pessoa.cpf,
        telefone: '21988887777',
        logradouro: 'Rua da Assembleia',
      });
    });

    it('"baixar meus dados": perfil, empréstimos e ações, sem a senha; exige login', async () => {
      const pessoa = await comDados();
      const equip = await criarEquipamento('Item Exportado');
      await http.post('/v1/emprestimos').set(auth(pessoa.token)).send({ equipamentoId: equip.id }).expect(201);

      await http.get('/v1/auth/eu/dados').expect(401);
      const r = await http.get('/v1/auth/eu/dados').set(auth(pessoa.token)).expect(200);
      expect(r.headers['content-disposition']).toContain('meus-dados.json');
      expect(r.headers['cache-control']).toContain('no-store');
      expect(r.body.perfil).toMatchObject({ id: pessoa.id, cpf: pessoa.cpf });
      expect(r.body.emprestimos).toHaveLength(1);
      expect(r.body.emprestimos[0]).toMatchObject({ equipamento: 'Item Exportado', status: 'ATIVO' });
      expect(JSON.stringify(r.body)).not.toMatch(/senhaHash|\$2[aby]\$/); // nem o hash da senha
    });

    it('excluir a conta exige a senha, e é recusado enquanto houver equipamento emprestado', async () => {
      const pessoa = await comDados();
      const equip = await criarEquipamento();
      const emprestimo = await http
        .post('/v1/emprestimos')
        .set(auth(pessoa.token))
        .send({ equipamentoId: equip.id })
        .expect(201);

      await http.post('/v1/auth/eu/anonimizar').send({ senha: SENHA }).expect(401);
      await http.post('/v1/auth/eu/anonimizar').set(auth(pessoa.token)).send({ senha: 'errada123' }).expect(422);
      await http.post('/v1/auth/eu/anonimizar').set(auth(pessoa.token)).send({}).expect(400);
      const bloqueada = await http
        .post('/v1/auth/eu/anonimizar')
        .set(auth(pessoa.token))
        .send({ senha: SENHA })
        .expect(409);
      expect(bloqueada.body.mensagem).toContain('Devolva');

      // nada foi apagado
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: pessoa.id } })).cpf).toBe(pessoa.cpf);

      // devolvendo, a exclusão passa
      await http.patch(`/v1/emprestimos/${emprestimo.body.id}/devolucao`).set(auth(pessoa.token)).expect(200);
      await http.post('/v1/auth/eu/anonimizar').set(auth(pessoa.token)).send({ senha: SENHA }).expect(204);
    });

    it('anonimização: some tudo que identifica, encerra o acesso e PRESERVA o histórico de empréstimos', async () => {
      const admin = await criarUsuario('ADMIN');
      const pessoa = await comDados();
      const sessao = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
      const equip = await criarEquipamento('Equipamento do Histórico');
      const emprestimo = await http
        .post('/v1/emprestimos')
        .set(auth(pessoa.token))
        .send({ equipamentoId: equip.id })
        .expect(201);
      await http.patch(`/v1/emprestimos/${emprestimo.body.id}/devolucao`).set(auth(pessoa.token)).expect(200);
      // uma ação da pessoa na trilha (trocar e-mail), que guarda o nome dela
      await http
        .patch('/v1/auth/eu')
        .set(auth(pessoa.token))
        .send({ email: `novo.${pessoa.id}@teste.com` })
        .expect(200);
      await aguardar();

      await http.post('/v1/auth/eu/anonimizar').set(auth(pessoa.token)).send({ senha: SENHA }).expect(204);
      await aguardar();

      const conta = await prisma.usuario.findUniqueOrThrow({ where: { id: pessoa.id } });
      expect(conta).toMatchObject({
        nome: 'Usuário removido',
        ativo: false,
        cpf: null,
        telefone: null,
        cep: null,
        logradouro: null,
        cidade: null,
        avatar: null,
      });
      expect(conta.email).toMatch(/^removido-\d+-[0-9a-f]+@anonimizado\.invalid$/);

      // não entra mais: nem com a senha antiga, nem com o token que existia, nem renovando a sessão
      await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: `novo.${pessoa.id}@teste.com`, senha: SENHA })
        .expect(401);
      await http.get('/v1/auth/eu').set(auth(pessoa.token)).expect(401);
      await http
        .post('/v1/auth/renovar')
        .set('X-Tipo-Cliente', 'api')
        .send({ refreshToken: sessao.body.refreshToken })
        .expect(401);

      // o histórico do equipamento continua, sem identificar ninguém
      const historico = await http.get(`/v1/emprestimos?equipamentoId=${equip.id}`).set(auth(admin.token)).expect(200);
      expect(historico.body.itens).toHaveLength(1);
      expect(historico.body.itens[0].usuario.nome).toBe('Usuário removido');
      expect(JSON.stringify(historico.body)).not.toContain(pessoa.email);

      // a trilha de auditoria também deixa de guardar o nome (e registra a exclusão)
      const trilha = await prisma.registroAuditoria.findMany({ where: { atorId: pessoa.id } });
      expect(trilha.map((t) => t.acao)).toEqual(expect.arrayContaining(['EMAIL_ALTERADO', 'CONTA_ANONIMIZADA']));
      expect(trilha.every((t) => t.atorNome === 'Usuário removido')).toBe(true);
    });

    it('depois de excluir, o CPF e o e-mail podem ser usados de novo por outra conta', async () => {
      const pessoa = await comDados();
      await http.post('/v1/auth/eu/anonimizar').set(auth(pessoa.token)).send({ senha: SENHA }).expect(204);

      const outra = await criarUsuario('USER');
      await http.patch('/v1/auth/eu').set(auth(outra.token)).send({ cpf: pessoa.cpf }).expect(200);
      await http
        .post('/v1/auth/registro')
        .send({ nome: 'Quem Voltou', email: pessoa.email, senha: 'SenhaForte123', aceitoPolitica: true })
        .expect(201);
    });
  });

  // =====================================================================================================
  describe('gestão de usuários: busca, e-mail de conta criada e configuração pública', () => {
    const aguardar = (ms = 200) => new Promise((r) => setTimeout(r, ms));

    it('busca por parte do nome ou do e-mail, sem diferenciar maiúsculas; combina com os outros filtros', async () => {
      const admin = await criarUsuario('ADMIN');
      const a = await prisma.usuario.create({
        data: { nome: 'Zuleika Buscável', email: 'zuleika.busca@teste.com', senhaHash },
      });
      await prisma.usuario.create({
        data: { nome: 'Outra Pessoa', email: 'zuzu.busca@teste.com', senhaHash, ativo: false },
      });

      const porNome = await http.get('/v1/usuarios?busca=ZULEIKA').set(auth(admin.token)).expect(200);
      expect(porNome.body.itens.map((u: { id: number }) => u.id)).toEqual([a.id]);

      const porEmail = await http.get('/v1/usuarios?busca=zuzu.busca').set(auth(admin.token)).expect(200);
      expect(porEmail.body.itens).toHaveLength(1);

      const dois = await http.get('/v1/usuarios?busca=.busca@teste').set(auth(admin.token)).expect(200);
      expect(dois.body.itens).toHaveLength(2);
      const soAtivos = await http.get('/v1/usuarios?busca=.busca@teste&ativo=true').set(auth(admin.token)).expect(200);
      expect(soAtivos.body.itens).toHaveLength(1);

      const nada = await http.get('/v1/usuarios?busca=nao-existe-ninguem-assim').set(auth(admin.token)).expect(200);
      expect(nada.body.itens).toEqual([]);
      expect(nada.body.meta.total).toBe(0);
    });

    it('conta criada por um administrador avisa a pessoa por e-mail, SEM a senha', async () => {
      const admin = await criarUsuario('ADMIN');
      await http
        .post('/v1/usuarios')
        .set(auth(admin.token))
        .send({ nome: 'Pessoa Avisada', email: 'pessoa.avisada@teste.com', senha: 'SenhaMuitoSecreta99', role: 'USER' })
        .expect(201);
      await aguardar();

      const recebidos = emails.filter((e) => e.para === 'pessoa.avisada@teste.com');
      expect(recebidos.map((e) => e.assunto)).toEqual(['Sua conta foi criada']);
      expect(recebidos[0].texto).toContain('/login');
      expect(recebidos[0].texto).not.toContain('SenhaMuitoSecreta99');
    });

    it('a configuração pública informa se o cadastro aberto está ligado (sem login)', async () => {
      const r = await http.get('/v1/auth/configuracao').expect(200);
      expect(r.body).toEqual({ cadastroPublico: true });
    });
  });

  // =====================================================================================================
  describe('sessão em cookie HttpOnly (o refresh token nunca chega ao JavaScript)', () => {
    const NOME = 'emp_sessao';
    const setCookies = (r: { headers: Record<string, unknown> }) => (r.headers['set-cookie'] ?? []) as string[];
    const cookieDa = (r: { headers: Record<string, unknown> }) => setCookies(r).find((c) => c.startsWith(`${NOME}=`));
    const valorDe = (c: string) => c.split(';')[0].slice(NOME.length + 1);
    const renovarCom = (valor: string, antiCsrf = true) => {
      const req = http.post('/v1/auth/renovar').set('Cookie', `${NOME}=${valor}`).send({});
      return antiCsrf ? req.set('X-Requested-With', 'emprestimos') : req;
    };

    it('o login entrega o token num cookie HttpOnly, SameSite=Strict e restrito às rotas de autenticação, e NÃO no corpo', async () => {
      const pessoa = await criarUsuario('USER');
      const r = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);

      expect(r.body.accessToken).toBeTruthy();
      expect(r.body.refreshToken).toBeUndefined(); // nada de token de renovação ao alcance do JavaScript

      const cookie = cookieDa(r)!;
      expect(cookie).toBeTruthy();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/v1/auth');
      expect(cookie).toMatch(/Max-Age=604800/); // 7 dias
      expect(valorDe(cookie).length).toBeGreaterThanOrEqual(40);
    });

    it('clientes que não são navegadores recebem o token no corpo se pedirem (X-Tipo-Cliente: api)', async () => {
      const pessoa = await criarUsuario('USER');
      const r = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
      expect(r.body.refreshToken).toBeTruthy();
      expect(valorDe(cookieDa(r)!)).toBe(r.body.refreshToken); // é o mesmo token
    });

    it('renovar pelo cookie exige o cabeçalho anti-CSRF, gira o token e a resposta continua sem token no corpo', async () => {
      const pessoa = await criarUsuario('USER');
      const login = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
      const antigo = valorDe(cookieDa(login)!);

      // sem o cabeçalho: recusado (e o token NÃO é consumido)
      await renovarCom(antigo, false).expect(400);

      const renovada = await renovarCom(antigo).expect(200);
      expect(renovada.body.accessToken).toBeTruthy();
      expect(renovada.body.refreshToken).toBeUndefined();
      const novo = valorDe(cookieDa(renovada)!);
      expect(novo).not.toBe(antigo);

      // o token novo funciona e o usuário autenticado pelo novo access token é a mesma pessoa
      const eu = await http.get('/v1/auth/eu').set(auth(renovada.body.accessToken)).expect(200);
      expect(eu.body.id).toBe(pessoa.id);
    });

    it('reapresentar o cookie antigo (já usado) derruba TODAS as sessões e limpa o cookie', async () => {
      const pessoa = await criarUsuario('USER');
      const login = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
      const antigo = valorDe(cookieDa(login)!);
      const renovada = await renovarCom(antigo).expect(200);
      const novo = valorDe(cookieDa(renovada)!);

      const reuso = await renovarCom(antigo).expect(401);
      expect(cookieDa(reuso)).toMatch(/Expires=Thu, 01 Jan 1970/); // o navegador apaga o cookie
      await renovarCom(novo).expect(401); // a sessão nova também caiu
    });

    it('sem cookie nem corpo é 401; cookie inventado é 401 e é limpo; o corpo continua valendo para clientes de API', async () => {
      await http.post('/v1/auth/renovar').set('X-Requested-With', 'emprestimos').send({}).expect(401);
      const falso = await renovarCom('x'.repeat(64)).expect(401);
      expect(cookieDa(falso)).toMatch(/Expires=Thu, 01 Jan 1970/);

      const pessoa = await criarUsuario('USER');
      const login = await http
        .post('/v1/auth/login')
        .set('X-Tipo-Cliente', 'api')
        .send({ email: pessoa.email, senha: SENHA })
        .expect(200);
      await http.post('/v1/auth/renovar').send({ refreshToken: login.body.refreshToken }).expect(200);
    });

    it('sair pelo cookie invalida o token no servidor e limpa o cookie (mesmo repetindo)', async () => {
      const pessoa = await criarUsuario('USER');
      const login = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
      const valor = valorDe(cookieDa(login)!);

      const saiu = await http.post('/v1/auth/sair').set('Cookie', `${NOME}=${valor}`).send({}).expect(204);
      expect(cookieDa(saiu)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await renovarCom(valor).expect(401); // o token morreu de verdade no servidor, não só no navegador

      await http.post('/v1/auth/sair').send({}).expect(204); // sem nada: idempotente
    });

    it('o cookie nunca é lido em rotas comuns: só o Authorization autentica', async () => {
      const pessoa = await criarUsuario('USER');
      const login = await http.post('/v1/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(200);
      await http
        .get('/v1/auth/eu')
        .set('Cookie', `${NOME}=${valorDe(cookieDa(login)!)}`)
        .expect(401);
    });
  });

  // =====================================================================================================
  describe('busca por texto nas listagens', () => {
    // Outros testes limpam a tabela de equipamentos: não deixa empréstimos pendurados neles
    afterAll(async () => {
      await prisma.emprestimo.deleteMany();
    });

    it('equipamentos: a busca encontra pelo nome OU pela descrição, sem diferenciar maiúsculas', async () => {
      const admin = await criarUsuario('ADMIN');
      const a = await prisma.equipamento.create({ data: { nome: 'Projetor Zefírio', descricao: 'sala azul' } });
      const b = await prisma.equipamento.create({
        data: { nome: 'Cabo qualquer', descricao: 'para o ZEFÍRIO de reserva' },
      });
      await prisma.equipamento.create({ data: { nome: 'Outra coisa', descricao: 'nada a ver' } });

      const r = await http.get('/v1/equipamentos?busca=zefírio&limite=100').set(auth(admin.token)).expect(200);
      expect(r.body.itens.map((e: { id: number }) => e.id).sort()).toEqual([a.id, b.id].sort());
      const soNome = await http.get('/v1/equipamentos?busca=Projetor Zef').set(auth(admin.token)).expect(200);
      expect(soNome.body.itens.map((e: { id: number }) => e.id)).toEqual([a.id]);
      const nada = await http.get('/v1/equipamentos?busca=xyz-inexistente').set(auth(admin.token)).expect(200);
      expect(nada.body.meta.total).toBe(0);
    });

    it('empréstimos: "meus" busca só pelo equipamento e só entre os MEUS; o admin também busca por pessoa', async () => {
      const admin = await criarUsuario('ADMIN');
      const ana = await prisma.usuario.create({
        data: { nome: 'Anabela Buscável', email: 'anabela.busca@teste.com', senhaHash },
      });
      const bia = await criarUsuario('USER');
      const equipA = await criarEquipamento('Notebook Quasar');
      const equipB = await criarEquipamento('Câmera Quasar Pro');
      const equipC = await criarEquipamento('Tripé Comum');
      const prazo = new Date(Date.now() + 5 * 86_400_000);
      await prisma.emprestimo.create({ data: { usuarioId: ana.id, equipamentoId: equipA.id, prazoDevolucao: prazo } });
      await prisma.emprestimo.create({ data: { usuarioId: ana.id, equipamentoId: equipC.id, prazoDevolucao: prazo } });
      await prisma.emprestimo.create({ data: { usuarioId: bia.id, equipamentoId: equipB.id, prazoDevolucao: prazo } });
      const tokenAna = await jwt.signAsync({ sub: ana.id });

      // "meus": só os dela, e só pelo nome do equipamento
      const meus = await http.get('/v1/emprestimos/meus?busca=QUASAR').set(auth(tokenAna)).expect(200);
      expect(meus.body.itens.map((e: { equipamento: { nome: string } }) => e.equipamento.nome)).toEqual([
        'Notebook Quasar',
      ]);
      const meusPorPessoa = await http.get('/v1/emprestimos/meus?busca=Anabela').set(auth(tokenAna)).expect(200);
      expect(meusPorPessoa.body.itens).toEqual([]); // buscar pelo próprio nome não acha nada aqui

      // admin: por equipamento, por nome da pessoa e por e-mail da pessoa
      const porEquip = await http.get('/v1/emprestimos?busca=quasar').set(auth(admin.token)).expect(200);
      expect(porEquip.body.itens).toHaveLength(2); // as duas máquinas "Quasar" (de pessoas diferentes)
      const porPessoa = await http.get('/v1/emprestimos?busca=anabela').set(auth(admin.token)).expect(200);
      expect(porPessoa.body.itens).toHaveLength(2);
      expect(porPessoa.body.itens.every((e: { usuario: { id: number } }) => e.usuario.id === ana.id)).toBe(true);
      const porEmail = await http.get('/v1/emprestimos?busca=ANABELA.BUSCA@teste').set(auth(admin.token)).expect(200);
      expect(porEmail.body.itens).toHaveLength(2);

      // combina com os outros filtros e valida o tamanho
      const combinado = await http
        .get('/v1/emprestimos?busca=anabela&status=DEVOLVIDO')
        .set(auth(admin.token))
        .expect(200);
      expect(combinado.body.itens).toEqual([]);
      await http
        .get(`/v1/emprestimos?busca=${'x'.repeat(121)}`)
        .set(auth(admin.token))
        .expect(400);
    });

    it('auditoria: busca pelo nome de quem fez e, se for número, pelo registro afetado', async () => {
      const admin = await criarUsuario('ADMIN');
      const alvo = await criarUsuario('USER');
      await http.patch(`/v1/usuarios/${alvo.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);
      await new Promise((r) => setTimeout(r, 250)); // a trilha é gravada em segundo plano

      const porNome = await http
        .get(`/v1/auditoria?busca=${encodeURIComponent(admin.nome.toUpperCase())}`)
        .set(auth(admin.token))
        .expect(200);
      expect(porNome.body.itens.length).toBeGreaterThan(0);
      expect(porNome.body.itens.every((i: { atorNome: string }) => i.atorNome === admin.nome)).toBe(true);

      const porNumero = await http
        .get(`/v1/auditoria?busca=${alvo.id}&acao=CONTA_DESATIVADA`)
        .set(auth(admin.token))
        .expect(200);
      expect(porNumero.body.itens.map((i: { entidadeId: number }) => i.entidadeId)).toContain(alvo.id);

      const nada = await http.get('/v1/auditoria?busca=pessoa-que-nao-existe-aqui').set(auth(admin.token)).expect(200);
      expect(nada.body.meta.total).toBe(0);
    });
  });

  // =====================================================================================================
  describe('relatório de auditoria (PDF, Excel e CSV)', () => {
    const aguardar = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    // supertest entrega arquivos binários como Buffer só se pedirmos
    const binario = (res: NodeJS.ReadableStream, cb: (erro: Error | null, corpo: Buffer) => void) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    };
    const baixar = (token: string, consulta: string) =>
      http
        .get(`/v1/auditoria/relatorio?${consulta}`)
        .set(auth(token))
        .buffer(true)
        .parse(binario as never);

    it('só ADMIN baixa; sem login é 401, usuário comum é 403; formato inválido ou ausente é 400', async () => {
      const admin = await criarUsuario('ADMIN');
      const comum = await criarUsuario('USER');
      await http.get('/v1/auditoria/relatorio?formato=csv').expect(401);
      await baixar(comum.token, 'formato=csv').expect(403);
      await baixar(admin.token, 'formato=doc').expect(400);
      await baixar(admin.token, '').expect(400);
    });

    it('cada formato chega com o tipo certo, como anexo, e é um arquivo de verdade', async () => {
      const admin = await criarUsuario('ADMIN');
      await http.post('/v1/equipamentos').set(auth(admin.token)).send({ nome: 'Item do relatório' }).expect(201);
      await aguardar();

      const pdf = await baixar(admin.token, 'formato=pdf').expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(/attachment; filename="auditoria-\d{4}-\d{2}-\d{2}\.pdf"/);
      expect(pdf.headers['cache-control']).toBe('no-store');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const xlsx = await baixar(admin.token, 'formato=xlsx').expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect(xlsx.headers['content-disposition']).toContain('.xlsx');
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      const csv = await baixar(admin.token, 'formato=csv').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('.csv');
      const texto = (csv.body as Buffer).toString('utf8');
      expect(texto.charCodeAt(0)).toBe(0xfeff); // BOM: o Excel abre os acentos certos
      expect(texto.slice(1).split('\r\n')[0]).toBe('"Data";"Hora";"Quem";"Ação";"Registro afetado";"Detalhes"');
    });

    it('data e hora saem em colunas separadas e o conteúdo está em português legível', async () => {
      const admin = await criarUsuario('ADMIN');
      const alvo = await criarUsuario('USER');
      await http.patch(`/v1/usuarios/${alvo.id}`).set(auth(admin.token)).send({ role: 'ADMIN' }).expect(200);
      await aguardar();

      const csv = await baixar(admin.token, `formato=csv&busca=${alvo.id}&acao=PAPEL_ALTERADO`).expect(200);
      const linhas = (csv.body as Buffer).toString('utf8').split('\r\n').filter(Boolean);
      expect(linhas.length).toBeGreaterThanOrEqual(2);
      const colunas = linhas[1].split(';').map((c) => c.replace(/^"|"$/g, ''));
      expect(colunas[0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/); // data
      expect(colunas[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/); // hora
      expect(colunas[2]).toBe(admin.nome);
      expect(colunas[3]).toBe('Perfil de acesso alterado');
      expect(colunas[4]).toBe(`Usuário nº ${alvo.id}`);
      expect(colunas[5]).toBe('Perfil: Administrador');
    });

    it('respeita os filtros (traz só o que casa) e cada arquivo conta quantos registros tem', async () => {
      const admin = await criarUsuario('ADMIN');
      await http.post('/v1/equipamentos').set(auth(admin.token)).send({ nome: 'Filtrável 1' }).expect(201);
      await http.post('/v1/equipamentos').set(auth(admin.token)).send({ nome: 'Filtrável 2' }).expect(201);
      await aguardar();

      const so = await baixar(admin.token, `formato=csv&atorId=${admin.id}&acao=EQUIPAMENTO_CRIADO`).expect(200);
      const linhas = (so.body as Buffer).toString('utf8').split('\r\n').filter(Boolean);
      expect(linhas).toHaveLength(3); // cabeçalho + 2
      expect(so.headers['x-total-registros']).toBe('2');
      expect(so.headers['x-relatorio-cortado']).toBe('false');
      expect(linhas.slice(1).every((l) => l.includes('Equipamento cadastrado'))).toBe(true);

      const nada = await baixar(admin.token, 'formato=csv&busca=ninguem-com-este-nome').expect(200);
      expect((nada.body as Buffer).toString('utf8').split('\r\n').filter(Boolean)).toHaveLength(1); // só o cabeçalho
    });

    it('INJEÇÃO DE FÓRMULA: um nome malicioso de equipamento não vira fórmula no CSV', async () => {
      const admin = await criarUsuario('ADMIN');
      await http
        .post('/v1/equipamentos')
        .set(auth(admin.token))
        .send({ nome: '=HYPERLINK("http://mau.example","clique")' })
        .expect(201);
      await aguardar();

      const csv = await baixar(admin.token, `formato=csv&atorId=${admin.id}&acao=EQUIPAMENTO_CRIADO`).expect(200);
      const texto = (csv.body as Buffer).toString('utf8');
      expect(texto).toContain('HYPERLINK'); // o dado está lá...
      // ...mas dentro de "Nome: =HYPERLINK..." (não no início da célula) e sem nenhuma célula começando em sinal de fórmula
      const celulas = texto.split('\r\n').flatMap((l) => l.split(';'));
      expect(celulas.some((c) => /^"[=+\-@]/.test(c))).toBe(false);
    });

    it('baixar o relatório também fica registrado na trilha (quem, qual formato, quantos registros)', async () => {
      const admin = await criarUsuario('ADMIN');
      await baixar(admin.token, 'formato=xlsx').expect(200);
      await aguardar();
      const r = await http
        .get(`/v1/auditoria?atorId=${admin.id}&acao=AUDITORIA_EXPORTADA`)
        .set(auth(admin.token))
        .expect(200);
      expect(r.body.itens).toHaveLength(1);
      expect(r.body.itens[0]).toMatchObject({
        acaoRotulo: 'Relatório de auditoria exportado',
        categoria: 'seguranca',
        entidadeRotulo: 'Auditoria',
      });
      expect(r.body.itens[0].descricao).toEqual(expect.arrayContaining([{ rotulo: 'Formato', valor: 'XLSX' }]));
    });

    it('a listagem traz o texto da ação, a categoria, a marca de crítica e os detalhes legíveis', async () => {
      const admin = await criarUsuario('ADMIN');
      const alvo = await criarUsuario('USER');
      await http.patch(`/v1/usuarios/${alvo.id}`).set(auth(admin.token)).send({ ativo: false }).expect(200);
      await aguardar();

      const r = await http
        .get(`/v1/auditoria?atorId=${admin.id}&acao=CONTA_DESATIVADA`)
        .set(auth(admin.token))
        .expect(200);
      expect(r.body.itens[0]).toMatchObject({
        acaoRotulo: 'Conta desativada',
        categoria: 'conta',
        critica: true,
        entidadeRotulo: 'Usuário',
        entidadeId: alvo.id,
      });
      expect(r.body.itens[0].descricao).toEqual([{ rotulo: 'Conta', valor: 'Desativada' }]);
    });

    it('GET /auditoria/acoes lista as ações com texto e categoria (alimenta o filtro da tela)', async () => {
      const admin = await criarUsuario('ADMIN');
      const r = await http.get('/v1/auditoria/acoes').set(auth(admin.token)).expect(200);
      expect(r.body.length).toBeGreaterThanOrEqual(15);
      expect(r.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            valor: 'PAPEL_ALTERADO',
            rotulo: 'Perfil de acesso alterado',
            categoria: 'conta',
            critica: true,
          }),
        ]),
      );
      const comum = await criarUsuario('USER');
      await http.get('/v1/auditoria/acoes').set(auth(comum.token)).expect(403);
    });
  });

  // =====================================================================================================
  describe('relatórios de empréstimos e de equipamentos', () => {
    const binario = (res: NodeJS.ReadableStream, cb: (erro: Error | null, corpo: Buffer) => void) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    };
    const baixar = (token: string, caminho: string) =>
      http
        .get(caminho)
        .set(auth(token))
        .buffer(true)
        .parse(binario as never);

    it('o acervo sai em CSV, Excel e PDF para o ADMIN e é 403 para usuário comum', async () => {
      const admin = await criarUsuario('ADMIN');
      const comum = await criarUsuario('USER');
      await criarEquipamento('Projetor do relatório');

      await baixar(comum.token, '/v1/equipamentos/relatorio?formato=csv').expect(403);
      await baixar(admin.token, '/v1/equipamentos/relatorio?formato=doc').expect(400);

      const csv = await baixar(
        admin.token,
        '/v1/equipamentos/relatorio?formato=csv&busca=Projetor do relatório',
      ).expect(200);
      expect(csv.headers['content-disposition']).toMatch(/attachment; filename="equipamentos-\d{4}-\d{2}-\d{2}\.csv"/);
      const texto = (csv.body as Buffer).toString('utf8');
      expect(texto).toContain('Projetor do relatório');
      expect(texto).toContain('Disponível');
      expect(csv.headers['x-relatorio-cortado']).toBe('false');

      const xlsx = await baixar(admin.token, '/v1/equipamentos/relatorio?formato=xlsx').expect(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
      const pdf = await baixar(admin.token, '/v1/equipamentos/relatorio?formato=pdf').expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('"relatorio" não é confundido com o id de um equipamento', async () => {
      const admin = await criarUsuario('ADMIN');
      await http.get('/v1/equipamentos/relatorio?formato=csv').set(auth(admin.token)).expect(200);
    });

    it('empréstimos: ADMIN baixa todos; a pessoa baixa só os seus; a situação sai em português', async () => {
      const admin = await criarUsuario('ADMIN');
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const equipA = await criarEquipamento('Notebook da Ana');
      const equipB = await criarEquipamento('Notebook da Bia');
      await http.post('/v1/emprestimos').set(auth(ana.token)).send({ equipamentoId: equipA.id }).expect(201);
      await http.post('/v1/emprestimos').set(auth(bia.token)).send({ equipamentoId: equipB.id }).expect(201);

      await baixar(ana.token, '/v1/emprestimos/relatorio?formato=csv').expect(403);
      await baixar(admin.token, '/v1/emprestimos/relatorio').expect(400);

      const todos = await baixar(admin.token, '/v1/emprestimos/relatorio?formato=csv').expect(200);
      const textoTodos = (todos.body as Buffer).toString('utf8');
      expect(textoTodos).toContain('Notebook da Ana');
      expect(textoTodos).toContain('Notebook da Bia');
      expect(textoTodos).toContain('Em andamento');

      const meus = await baixar(ana.token, '/v1/emprestimos/meus/relatorio?formato=csv').expect(200);
      const textoMeus = (meus.body as Buffer).toString('utf8');
      expect(textoMeus).toContain('Notebook da Ana');
      expect(textoMeus).not.toContain('Notebook da Bia'); // nunca mistura os dados de outra pessoa

      await http.get('/v1/emprestimos/meus/relatorio?formato=csv').expect(401);
      await prisma.emprestimo.deleteMany(); // os testes seguintes apagam equipamentos e esperam a tabela vazia
    });
  });

  // =====================================================================================================
  describe('renovação de prazo', () => {
    async function emprestimoDe(token: string, dias = 3) {
      const equipamento = await criarEquipamento();
      const r = await http
        .post('/v1/emprestimos')
        .set(auth(token))
        .send({ equipamentoId: equipamento.id, dias })
        .expect(201);
      return r.body as { id: number; prazoDevolucao: string };
    }

    it('soma 7 dias por padrão, conta a renovação e para no limite de 2', async () => {
      const ana = await criarUsuario('USER');
      const e = await emprestimoDe(ana.token);

      const um = await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({}).expect(200);
      const dias = (new Date(um.body.prazoDevolucao).getTime() - new Date(e.prazoDevolucao).getTime()) / 86_400_000;
      expect(Math.round(dias)).toBe(7);
      expect(um.body.renovacoes).toBe(1);
      expect(um.body.podeRenovar).toBe(true);

      const dois = await http
        .patch(`/v1/emprestimos/${e.id}/renovacao`)
        .set(auth(ana.token))
        .send({ dias: 2 })
        .expect(200);
      expect(dois.body.renovacoes).toBe(2);
      expect(dois.body.podeRenovar).toBe(false);

      const terceira = await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({}).expect(409);
      expect(JSON.stringify(terceira.body)).toContain('limite');
    });

    it('só o dono ou um ADMIN renova; dias fora de 1 a 14 são recusados; sem login é 401', async () => {
      const ana = await criarUsuario('USER');
      const outra = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const e = await emprestimoDe(ana.token);

      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).send({}).expect(401);
      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(outra.token)).send({}).expect(403);
      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({ dias: 0 }).expect(400);
      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({ dias: 15 }).expect(400);
      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(admin.token)).send({ dias: 1 }).expect(200);
      await http.patch('/v1/emprestimos/999999/renovacao').set(auth(admin.token)).send({}).expect(404);
    });

    it('não renova empréstimo devolvido nem vencido', async () => {
      const ana = await criarUsuario('USER');
      const devolvido = await emprestimoDe(ana.token);
      await http.patch(`/v1/emprestimos/${devolvido.id}/devolucao`).set(auth(ana.token)).expect(200);
      await http.patch(`/v1/emprestimos/${devolvido.id}/renovacao`).set(auth(ana.token)).send({}).expect(409);

      const vencido = await emprestimoDe(ana.token);
      await prisma.emprestimo.update({
        where: { id: vencido.id },
        data: { prazoDevolucao: new Date(Date.now() - 86_400_000) },
      });
      const r = await http.patch(`/v1/emprestimos/${vencido.id}/renovacao`).set(auth(ana.token)).send({}).expect(409);
      expect(JSON.stringify(r.body)).toContain('venceu');
    });

    it('renovações SIMULTÂNEAS nunca passam do limite de 2', async () => {
      const ana = await criarUsuario('USER');
      const e = await emprestimoDe(ana.token);
      const respostas = await Promise.all(
        Array.from({ length: 6 }, () =>
          http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({ dias: 1 }),
        ),
      );
      const certas = respostas.filter((r) => r.status === 200).length;
      expect(certas).toBeLessThanOrEqual(2);
      expect(certas).toBeGreaterThanOrEqual(1);
      const salvo = await prisma.emprestimo.findUniqueOrThrow({ where: { id: e.id } });
      expect(salvo.renovacoes).toBe(certas);
      expect(salvo.renovacoes).toBeLessThanOrEqual(2);
    });

    it('a renovação entra na auditoria e zera os avisos por e-mail do prazo antigo', async () => {
      const ana = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const e = await emprestimoDe(ana.token);
      await prisma.emprestimo.update({ where: { id: e.id }, data: { lembreteEnviadoEm: new Date() } });
      await http.patch(`/v1/emprestimos/${e.id}/renovacao`).set(auth(ana.token)).send({}).expect(200);

      const salvo = await prisma.emprestimo.findUniqueOrThrow({ where: { id: e.id } });
      expect(salvo.lembreteEnviadoEm).toBeNull();
      await new Promise((r) => setTimeout(r, 300));
      const lista = await http.get('/v1/auditoria?acao=EMPRESTIMO_RENOVADO').set(auth(admin.token)).expect(200);
      expect(lista.body.itens.length).toBeGreaterThanOrEqual(1);
      expect(lista.body.itens[0].acaoRotulo).toBe('Prazo renovado');
      await prisma.emprestimo.deleteMany(); // os testes seguintes apagam equipamentos e esperam a tabela vazia
    });
  });

  // =====================================================================================================
  describe('fila de espera', () => {
    const aguardar = (ms = 300) => new Promise((r) => setTimeout(r, ms));
    async function emprestado(dono: { token: string }) {
      const equipamento = await criarEquipamento();
      await http.post('/v1/emprestimos').set(auth(dono.token)).send({ equipamentoId: equipamento.id }).expect(201);
      return equipamento;
    }

    it('entra na fila, vê a posição, e a lista de equipamentos mostra o tamanho da fila', async () => {
      const dono = await criarUsuario('USER');
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const e = await emprestado(dono);

      const a = await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(201);
      const b = await http.post('/v1/reservas').set(auth(bia.token)).send({ equipamentoId: e.id }).expect(201);
      expect(a.body.posicao).toBe(1);
      expect(b.body.posicao).toBe(2);

      const minhas = await http.get('/v1/reservas/minhas').set(auth(bia.token)).expect(200);
      expect(minhas.body).toHaveLength(1);
      expect(minhas.body[0].posicao).toBe(2);
      expect(minhas.body[0].equipamento.nome).toBe(e.nome);

      const lista = await http
        .get(`/v1/equipamentos?busca=${encodeURIComponent(e.nome)}`)
        .set(auth(admin.token))
        .expect(200);
      expect(lista.body.itens[0].fila).toBe(2);
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    });

    it('regras: disponível não tem fila, não entra duas vezes, nem na fila do que já está com você', async () => {
      const dono = await criarUsuario('USER');
      const ana = await criarUsuario('USER');
      const livre = await criarEquipamento();
      await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: livre.id }).expect(409);

      const e = await emprestado(dono);
      await http.post('/v1/reservas').set(auth(dono.token)).send({ equipamentoId: e.id }).expect(409);
      await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(201);
      await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(409);
      await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: 999999 }).expect(404);
      await http.post('/v1/reservas').set(auth(ana.token)).send({}).expect(400);
      await http.post('/v1/reservas').send({ equipamentoId: e.id }).expect(401);
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    });

    it('cliques SIMULTÂNEOS da mesma pessoa criam uma única reserva', async () => {
      const dono = await criarUsuario('USER');
      const ana = await criarUsuario('USER');
      const e = await emprestado(dono);
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id })),
      );
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await prisma.reserva.count({ where: { usuarioId: ana.id, status: 'AGUARDANDO' } })).toBe(1);
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    });

    it('ao devolver, o PRIMEIRO da fila recebe e-mail; quem pega o equipamento sai da fila', async () => {
      const dono = await criarUsuario('USER');
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const e = await emprestado(dono);
      await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(201);
      await http.post('/v1/reservas').set(auth(bia.token)).send({ equipamentoId: e.id }).expect(201);

      emails.length = 0;
      const emp = await prisma.emprestimo.findFirstOrThrow({ where: { equipamentoId: e.id } });
      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(dono.token)).expect(200);
      await aguardar();
      expect(emails).toHaveLength(1);
      expect(emails[0].para).toBe(ana.email);
      expect(emails[0].assunto).toContain(e.nome);

      // Ana pega: sai da fila; a de Bia continua
      await http.post('/v1/emprestimos').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(201);
      expect(await prisma.reserva.count({ where: { usuarioId: ana.id, status: 'AGUARDANDO' } })).toBe(0);
      expect(await prisma.reserva.count({ where: { usuarioId: ana.id, status: 'ATENDIDA' } })).toBe(1);
      expect(await prisma.reserva.count({ where: { usuarioId: bia.id, status: 'AGUARDANDO' } })).toBe(1);
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    });

    it('sair da fila: a própria pessoa ou ADMIN; outra pessoa é 403; depois de sair, 409', async () => {
      const dono = await criarUsuario('USER');
      const ana = await criarUsuario('USER');
      const outra = await criarUsuario('USER');
      const admin = await criarUsuario('ADMIN');
      const e = await emprestado(dono);
      const r = await http.post('/v1/reservas').set(auth(ana.token)).send({ equipamentoId: e.id }).expect(201);

      await http.delete(`/v1/reservas/${r.body.id}`).set(auth(outra.token)).expect(403);
      await http.delete(`/v1/reservas/${r.body.id}`).set(auth(ana.token)).expect(204);
      await http.delete(`/v1/reservas/${r.body.id}`).set(auth(admin.token)).expect(409);
      await http.delete('/v1/reservas/999999').set(auth(ana.token)).expect(404);
      expect((await http.get('/v1/reservas/minhas').set(auth(ana.token)).expect(200)).body).toHaveLength(0);

      // devolver agora não manda e-mail para ninguém (a fila está vazia)
      emails.length = 0;
      const emp = await prisma.emprestimo.findFirstOrThrow({ where: { equipamentoId: e.id } });
      await http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(dono.token)).expect(200);
      await aguardar();
      expect(emails).toHaveLength(0);
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    });
  });

  // =====================================================================================================
  describe('prioridade de quem reservou primeiro', () => {
    const aguardar = (ms = 300) => new Promise((r) => setTimeout(r, ms));
    async function filaDe(...pessoas: { token: string }[]) {
      const dono = await criarUsuario('USER');
      const equipamento = await criarEquipamento();
      await http.post('/v1/emprestimos').set(auth(dono.token)).send({ equipamentoId: equipamento.id }).expect(201);
      for (const p of pessoas) {
        await http.post('/v1/reservas').set(auth(p.token)).send({ equipamentoId: equipamento.id }).expect(201);
        await new Promise((r) => setTimeout(r, 15)); // ordem de chegada bem definida
      }
      const emp = await prisma.emprestimo.findFirstOrThrow({ where: { equipamentoId: equipamento.id } });
      return {
        dono,
        equipamento,
        devolver: () => http.patch(`/v1/emprestimos/${emp.id}/devolucao`).set(auth(dono.token)).expect(200),
      };
    }
    const limpar = async () => {
      await prisma.reserva.deleteMany();
      await prisma.emprestimo.deleteMany();
    };

    it('ao devolver, só o PRIMEIRO da fila pode pegar; um intruso recebe 409 e o segundo também', async () => {
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const intruso = await criarUsuario('USER');
      const { equipamento, devolver } = await filaDe(ana, bia);
      await devolver();

      const bloqueado = await http
        .post('/v1/emprestimos')
        .set(auth(intruso.token))
        .send({ equipamentoId: equipamento.id })
        .expect(409);
      expect(JSON.stringify(bloqueado.body)).toContain('reservado');
      await http.post('/v1/emprestimos').set(auth(bia.token)).send({ equipamentoId: equipamento.id }).expect(409); // 2ª da fila espera

      const minhas = await http.get('/v1/reservas/minhas').set(auth(ana.token)).expect(200);
      expect(minhas.body[0].minhaVez).toBe(true);
      expect(minhas.body[0].prioridadeAte).toBeTruthy();
      const daBia = await http.get('/v1/reservas/minhas').set(auth(bia.token)).expect(200);
      expect(daBia.body[0].minhaVez).toBe(false);

      const admin = await criarUsuario('ADMIN');
      const lista = await http
        .get(`/v1/equipamentos?busca=${encodeURIComponent(equipamento.nome)}`)
        .set(auth(admin.token))
        .expect(200);
      expect(lista.body.itens[0].reservado).toBe(true);

      await http.post('/v1/emprestimos').set(auth(ana.token)).send({ equipamentoId: equipamento.id }).expect(201); // a primeira pega
      await limpar();
    });

    it('a pessoa da vez não pega a tempo: a vez expira e passa para a próxima da fila, com e-mail', async () => {
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const { equipamento, devolver } = await filaDe(ana, bia);
      await devolver();
      await aguardar();

      emails.length = 0;
      // o prazo exclusivo da Ana acaba
      await prisma.reserva.updateMany({
        where: { usuarioId: ana.id, status: 'AGUARDANDO' },
        data: { prioridadeAte: new Date(Date.now() - 1000) },
      });
      // a próxima tentativa (de qualquer pessoa) já encontra a fila em ordem: a vez é da Bia
      const admin = await criarUsuario('ADMIN');
      await http.post('/v1/emprestimos').set(auth(admin.token)).send({ equipamentoId: equipamento.id }).expect(409);
      expect(await prisma.reserva.count({ where: { usuarioId: ana.id, status: 'EXPIRADA' } })).toBe(1);
      const daBia = await http.get('/v1/reservas/minhas').set(auth(bia.token)).expect(200);
      expect(daBia.body[0].minhaVez).toBe(true);

      await http.post('/v1/emprestimos').set(auth(bia.token)).send({ equipamentoId: equipamento.id }).expect(201);
      await limpar();
    });

    it('quem tem a vez e desiste (sai da fila) passa a vez para o próximo e ele é avisado', async () => {
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const { devolver } = await filaDe(ana, bia);
      await devolver();
      const minha = (await http.get('/v1/reservas/minhas').set(auth(ana.token)).expect(200)).body[0];

      emails.length = 0;
      await http.delete(`/v1/reservas/${minha.id}`).set(auth(ana.token)).expect(204);
      await aguardar();
      const daBia = await http.get('/v1/reservas/minhas').set(auth(bia.token)).expect(200);
      expect(daBia.body[0].minhaVez).toBe(true);
      expect(emails.some((e) => e.para === bia.email && e.texto.includes('reservado para você até'))).toBe(true);
      await limpar();
    });

    it('sem fila, o equipamento devolvido continua livre para qualquer pessoa (ordem de chegada)', async () => {
      const outra = await criarUsuario('USER');
      const { equipamento, devolver } = await filaDe();
      await devolver();
      await http.post('/v1/emprestimos').set(auth(outra.token)).send({ equipamentoId: equipamento.id }).expect(201);
      await limpar();
    });

    it('a rotina periódica passa a vez e avisa sozinha, sem ninguém tentar pegar', async () => {
      const ana = await criarUsuario('USER');
      const bia = await criarUsuario('USER');
      const { devolver } = await filaDe(ana, bia);
      await devolver();
      await aguardar();
      await prisma.reserva.updateMany({
        where: { usuarioId: ana.id, status: 'AGUARDANDO' },
        data: { prioridadeAte: new Date(Date.now() - 1000) },
      });
      emails.length = 0;
      const { ReservasService } = await import('../src/reservas/reservas.service.js');
      await app.get(ReservasService).manterFilas();
      expect(emails.some((e) => e.para === bia.email)).toBe(true);
      expect(await prisma.reserva.count({ where: { usuarioId: ana.id, status: 'EXPIRADA' } })).toBe(1);
      await limpar();
    });
  });

  // =====================================================================================================
  describe('foto do equipamento', () => {
    // Cabeçalhos reais de cada formato seguidos de enchimento: o servidor confere só os bytes iniciais
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 2)]);
    const enviar = (token: string, id: number, tipo: string, corpo: Buffer) =>
      http.put(`/v1/equipamentos/${id}/foto`).set(auth(token)).set('Content-Type', tipo).send(corpo);
    const binario = (res: NodeJS.ReadableStream, cb: (erro: Error | null, corpo: Buffer) => void) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    };

    it('o ADMIN envia a foto; a lista traz só a versão; a imagem sai pelo código, sem login, e é guardada no cache', async () => {
      const admin = await criarUsuario('ADMIN');
      const e = await criarEquipamento();
      const antes = await http.get(`/v1/equipamentos/${e.id}`).set(auth(admin.token)).expect(200);
      expect(antes.body.fotoVersao).toBeNull();

      const r = await enviar(admin.token, e.id, 'image/jpeg', jpeg).expect(200);
      expect(typeof r.body.fotoVersao).toBe('number');
      expect(JSON.stringify(r.body)).not.toContain('dados'); // os bytes nunca vão para o JSON

      const img = await http
        .get(`/v1/equipamentos/foto/${e.codigo}`)
        .buffer(true)
        .parse(binario as never)
        .expect(200);
      expect(img.headers['content-type']).toContain('image/jpeg');
      expect(img.headers['cache-control']).toContain('immutable');
      expect((img.body as Buffer).equals(jpeg)).toBe(true);
      // o código aceita minúsculas (vem de uma URL digitada)
      await http.get(`/v1/equipamentos/foto/${e.codigo.toLowerCase()}`).expect(200);

      // trocar a foto muda a versão
      await new Promise((r2) => setTimeout(r2, 20));
      const troca = await enviar(admin.token, e.id, 'image/png', png).expect(200);
      expect(troca.body.fotoVersao).toBeGreaterThan(r.body.fotoVersao);
    });

    it('recusa: usuário comum (403), sem login (401), SVG/HTML disfarçado, tipo que não bate, vazio e corpo que não é imagem', async () => {
      const admin = await criarUsuario('ADMIN');
      const comum = await criarUsuario('USER');
      const e = await criarEquipamento();

      await enviar(comum.token, e.id, 'image/jpeg', jpeg).expect(403);
      await http.put(`/v1/equipamentos/${e.id}/foto`).set('Content-Type', 'image/jpeg').send(jpeg).expect(401);
      await enviar(admin.token, e.id, 'image/png', jpeg).expect(400); // diz PNG, mas os bytes são JPEG
      await enviar(
        admin.token,
        e.id,
        'image/jpeg',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      ).expect(400);
      await enviar(admin.token, e.id, 'image/svg+xml', Buffer.from('<svg></svg>')).expect(400);
      await http.put(`/v1/equipamentos/${e.id}/foto`).set(auth(admin.token)).send({ imagem: 'x' }).expect(400); // JSON, não imagem
      await enviar(admin.token, 999999, 'image/jpeg', jpeg).expect(404);
    });

    it('imagem grande demais (mais de 400 KB) é recusada', async () => {
      const admin = await criarUsuario('ADMIN');
      const e = await criarEquipamento();
      const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(450 * 1024, 3)]);
      const r = await enviar(admin.token, e.id, 'image/jpeg', grande);
      expect(r.status).toBe(413);
      expect(JSON.stringify(r.body)).toContain('400 KB');
    });

    it('remover apaga a foto (e a imagem some, 404); equipamento sem foto também dá 404; entra na auditoria', async () => {
      const admin = await criarUsuario('ADMIN');
      const e = await criarEquipamento();
      await http.get(`/v1/equipamentos/foto/${e.codigo}`).expect(404);

      await enviar(admin.token, e.id, 'image/jpeg', jpeg).expect(200);
      const r = await http.delete(`/v1/equipamentos/${e.id}/foto`).set(auth(admin.token)).expect(200);
      expect(r.body.fotoVersao).toBeNull();
      await http.get(`/v1/equipamentos/foto/${e.codigo}`).expect(404);
      await http.get('/v1/equipamentos/foto/CODIGOINEXISTENTE').expect(404);

      await new Promise((r2) => setTimeout(r2, 300));
      const lista = await http.get('/v1/auditoria?acao=EQUIPAMENTO_FOTO_ATUALIZADA').set(auth(admin.token)).expect(200);
      expect(lista.body.itens.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =====================================================================================================
  describe('métricas de monitoramento', () => {
    it('sem o token certo é 401; com ele, 200 em texto no formato do Prometheus, com números de verdade', async () => {
      await http.get('/metricas').expect(401);
      await http.get('/metricas').set('Authorization', 'Bearer token-errado').expect(401);
      await http.get('/metricas').set('Authorization', 'Bearer token-de-metricas-de-teste-123').expect(401); // tamanho igual, valor diferente

      const dono = await criarUsuario('USER');
      const equipamento = await criarEquipamento();
      await http.post('/v1/emprestimos').set(auth(dono.token)).send({ equipamentoId: equipamento.id }).expect(201);

      const r = await http.get('/metricas').set('Authorization', 'Bearer token-de-metricas-de-teste').expect(200);
      expect(r.headers['content-type']).toContain('text/plain');
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.text).toContain('emprestimo_up 1');
      expect(r.text).toContain('emprestimo_db_up 1');
      expect(r.text).toMatch(/emprestimo_emprestimos_ativos [1-9]\d*/);
      expect(r.text).toMatch(/emprestimo_http_requests_total\{status="2xx"\} [1-9]\d*/);
      expect(r.text).toMatch(/emprestimo_http_requests_total\{status="4xx"\} [1-9]\d*/); // os 401 acima
      await prisma.emprestimo.deleteMany();
    });

    it('a rota não aparece na documentação nem exige login de usuário', async () => {
      const r = await http.get('/metricas').expect(401);
      expect(JSON.stringify(r.body)).toContain('Token de métricas');
    });
  });

  // =====================================================================================================
  describe('limite de requisições', () => {
    it('mais de 5 logins por minuto devolvem 429', async () => {
      const pessoa = await criarUsuario('USER');
      const tentativas: number[] = [];
      for (let i = 0; i < 7; i++)
        tentativas.push(
          (
            await http
              .post('/v1/auth/login')
              .set('X-Tipo-Cliente', 'api')
              .send({ email: pessoa.email, senha: 'Errada12345' })
          ).status,
        );
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
              .send({ nome: `Massa ${i}`, email: `massa${i}@teste.com`, senha: SENHA, aceitoPolitica: true })
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
