import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { Role } from '../../generated/prisma/enums';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { AuthService } from './auth.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const CUSTO = 4;

describe('AuthService', () => {
  let usuarios: jest.Mocked<UsuariosRepository>;
  let sessoes: jest.Mocked<SessoesRepository>;
  let jwt: JwtService;
  let servico: AuthService;
  let senhaHash: string;

  beforeAll(async () => {
    senhaHash = await bcrypt.hash('Senha12345', CUSTO);
  });

  beforeEach(() => {
    usuarios = {
      criar: jest.fn(),
      buscarPorEmailComHash: jest.fn(),
      buscarAutenticacao: jest.fn(),
    } as unknown as jest.Mocked<UsuariosRepository>;
    sessoes = {
      criar: jest.fn(),
      buscarPorHash: jest.fn(),
      revogar: jest.fn(),
      revogarTodasDoUsuario: jest.fn(),
      removerAntigos: jest.fn(),
    } as unknown as jest.Mocked<SessoesRepository>;
    jwt = new JwtService({ secret: 'segredo-de-teste-com-mais-de-32-caracteres-x', signOptions: { expiresIn: '15m' } });
    const config = {
      getOrThrow: jest.fn((chave: string) => (chave === 'bcryptCusto' ? CUSTO : 7)),
    } as unknown as ConfigService;
    servico = new AuthService(usuarios, sessoes, jwt, config, { registrar: jest.fn() } as never);
  });

  describe('registrar', () => {
    it('SEMPRE cria USER: não há como pedir outro papel por aqui', async () => {
      usuarios.criar.mockResolvedValue({
        id: 1,
        nome: 'A',
        email: 'a@t.com',
        role: Role.USER,
        ativo: true,
        cpf: null,
        telefone: null,
        cep: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        cidade: null,
        uf: null,
        avatar: null,
        criadoEm: new Date(),
      });
      // mesmo que um objeto malicioso chegasse com role, o serviço o ignora
      await servico.registrar({ nome: 'A', email: 'a@t.com', senha: 'Senha12345', role: 'ADMIN' } as never);
      expect(usuarios.criar.mock.calls[0][0].role).toBe(Role.USER);
    });

    it('e-mail repetido dá 409', async () => {
      usuarios.criar.mockResolvedValue(null);
      await expect(servico.registrar({ nome: 'A', email: 'a@t.com', senha: 'Senha12345' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const conta = {
      id: 1,
      nome: 'A',
      email: 'a@t.com',
      senhaHash: '',
      role: Role.USER,
      ativo: true,
      cpf: null,
      telefone: null,
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
      avatar: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    it('devolve o par de tokens e guarda só o HASH do refresh token', async () => {
      usuarios.buscarPorEmailComHash.mockResolvedValue({ ...conta, senhaHash });
      const tokens = await servico.login({ email: 'a@t.com', senha: 'Senha12345' });

      expect(tokens).toMatchObject({
        tipo: 'Bearer',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(sessoes.criar.mock.calls[0][0].tokenHash).toBe(hash(tokens.refreshToken));
      expect(sessoes.criar.mock.calls[0][0].tokenHash).not.toBe(tokens.refreshToken);
      // o token de acesso leva só o id, nunca papel nem senha
      expect(Object.keys(jwt.decode(tokens.accessToken)).sort()).toEqual(['exp', 'iat', 'sub']);
    });

    it('e-mail inexistente, senha errada e conta desativada: a MESMA mensagem', async () => {
      const mensagens: string[] = [];
      for (const caso of [null, { ...conta, senhaHash }, { ...conta, senhaHash, ativo: false }]) {
        usuarios.buscarPorEmailComHash.mockResolvedValue(caso);
        const senha = caso === null || caso.ativo ? 'SenhaErrada1' : 'Senha12345';
        await servico.login({ email: 'a@t.com', senha }).catch((e: UnauthorizedException) => mensagens.push(e.message));
      }
      expect(mensagens).toHaveLength(3);
      expect(new Set(mensagens).size).toBe(1);
    });
  });

  describe('renovar', () => {
    const agora = Date.now();
    const sessao = (extra = {}) => ({
      id: 3,
      usuarioId: 1,
      tokenHash: 'h',
      criadoEm: new Date(),
      expiraEm: new Date(agora + 3_600_000),
      revogadoEm: null,
      ...extra,
    });

    it('troca o token (rotação): revoga o antigo e emite um par novo', async () => {
      sessoes.buscarPorHash.mockResolvedValue(sessao());
      usuarios.buscarAutenticacao.mockResolvedValue({ id: 1, role: Role.USER, ativo: true });
      sessoes.revogar.mockResolvedValue(true);

      const tokens = await servico.renovar('token-qualquer');
      expect(sessoes.revogar).toHaveBeenCalledWith(3);
      expect(tokens.refreshToken).toEqual(expect.any(String));
    });

    it('REUSO de token já revogado derruba TODAS as sessões (sinal de roubo)', async () => {
      sessoes.buscarPorHash.mockResolvedValue(sessao({ revogadoEm: new Date() }));
      await expect(servico.renovar('t')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(1);
    });

    it('perder a corrida da revogação (dois pedidos juntos) também derruba tudo', async () => {
      sessoes.buscarPorHash.mockResolvedValue(sessao());
      usuarios.buscarAutenticacao.mockResolvedValue({ id: 1, role: Role.USER, ativo: true });
      sessoes.revogar.mockResolvedValue(false);
      await expect(servico.renovar('t')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(1);
    });

    it('recusa token desconhecido, expirado e de conta desativada', async () => {
      sessoes.buscarPorHash.mockResolvedValueOnce(null);
      await expect(servico.renovar('t')).rejects.toBeInstanceOf(UnauthorizedException);

      sessoes.buscarPorHash.mockResolvedValueOnce(sessao({ expiraEm: new Date(agora - 1000) }));
      await expect(servico.renovar('t')).rejects.toThrow('expirada');

      sessoes.buscarPorHash.mockResolvedValueOnce(sessao());
      usuarios.buscarAutenticacao.mockResolvedValueOnce({ id: 1, role: Role.USER, ativo: false });
      await expect(servico.renovar('t')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessoes.revogar).not.toHaveBeenCalled();
    });
  });

  describe('sair', () => {
    it('revoga a sessão; token desconhecido ou já revogado não é erro (idempotente)', async () => {
      sessoes.buscarPorHash.mockResolvedValueOnce({
        id: 3,
        usuarioId: 1,
        tokenHash: 'h',
        criadoEm: new Date(),
        expiraEm: new Date(),
        revogadoEm: null,
      });
      await servico.sair('t');
      expect(sessoes.revogar).toHaveBeenCalledWith(3);

      sessoes.buscarPorHash.mockResolvedValueOnce(null);
      await expect(servico.sair('t')).resolves.toBeUndefined();
    });
  });
});
