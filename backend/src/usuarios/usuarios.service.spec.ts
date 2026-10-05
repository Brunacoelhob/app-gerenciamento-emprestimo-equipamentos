import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../generated/prisma/enums';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { UsuariosRepository, UsuarioPublico } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

const usuario = (sobrescrever: Partial<UsuarioPublico> = {}): UsuarioPublico => ({
  id: 2,
  nome: 'Alvo',
  email: 'alvo@teste.com',
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
  ...sobrescrever,
});

describe('UsuariosService', () => {
  let repo: jest.Mocked<UsuariosRepository>;
  let sessoes: jest.Mocked<SessoesRepository>;
  let servico: UsuariosService;

  beforeEach(() => {
    repo = {
      criar: jest.fn(),
      buscarPorId: jest.fn(),
      listar: jest.fn(),
      atualizar: jest.fn(),
      contarAdminsAtivos: jest.fn(),
    } as unknown as jest.Mocked<UsuariosRepository>;
    sessoes = { revogarTodasDoUsuario: jest.fn() } as unknown as jest.Mocked<SessoesRepository>;
    const config = { getOrThrow: jest.fn().mockReturnValue(4) } as unknown as ConfigService;
    servico = new UsuariosService(repo, sessoes, config, { enviar: jest.fn().mockResolvedValue(undefined) } as never);
  });

  describe('criar', () => {
    it('grava só o hash da senha, nunca a senha', async () => {
      repo.criar.mockResolvedValue(usuario());
      await servico.criar({ nome: 'Novo', email: 'novo@teste.com', senha: 'Senha12345', role: Role.ADMIN });
      const dados = repo.criar.mock.calls[0][0];
      expect(dados.senhaHash).toMatch(/^\$2[aby]\$/);
      expect(JSON.stringify(dados)).not.toContain('Senha12345');
      expect(dados.role).toBe(Role.ADMIN);
    });

    it('sem papel informado a conta é USER', async () => {
      repo.criar.mockResolvedValue(usuario());
      await servico.criar({ nome: 'Novo', email: 'novo@teste.com', senha: 'Senha12345' });
      expect(repo.criar.mock.calls[0][0].role).toBe(Role.USER);
    });

    it('e-mail repetido dá 409', async () => {
      repo.criar.mockResolvedValue(null);
      await expect(servico.criar({ nome: 'X', email: 'x@teste.com', senha: 'Senha12345' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('atualizar', () => {
    it('usuário inexistente dá 404', async () => {
      repo.buscarPorId.mockResolvedValue(null);
      await expect(servico.atualizar(9, { ativo: false }, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('um admin não rebaixa nem desativa a si mesmo', async () => {
      repo.buscarPorId.mockResolvedValue(usuario({ id: 1, role: Role.ADMIN }));
      await expect(servico.atualizar(1, { role: Role.USER }, 1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(servico.atualizar(1, { ativo: false }, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.atualizar).not.toHaveBeenCalled();
    });

    it('nunca remove o ÚLTIMO administrador ativo (proteção contra corrida entre dois admins)', async () => {
      repo.buscarPorId.mockResolvedValue(usuario({ id: 2, role: Role.ADMIN }));
      repo.contarAdminsAtivos.mockResolvedValue(1);
      await expect(servico.atualizar(2, { ativo: false }, 1)).rejects.toThrow('último administrador');
      await expect(servico.atualizar(2, { role: Role.USER }, 1)).rejects.toThrow('último administrador');
      expect(repo.atualizar).not.toHaveBeenCalled();
    });

    it('desativar encerra as sessões da pessoa; ativar de novo não precisa', async () => {
      repo.buscarPorId.mockResolvedValue(usuario({ id: 2 }));
      repo.atualizar.mockResolvedValue(usuario({ id: 2, ativo: false }));
      await servico.atualizar(2, { ativo: false }, 1);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(2);

      sessoes.revogarTodasDoUsuario.mockClear();
      repo.buscarPorId.mockResolvedValue(usuario({ id: 2, ativo: false }));
      await servico.atualizar(2, { ativo: true }, 1);
      expect(sessoes.revogarTodasDoUsuario).not.toHaveBeenCalled();
    });

    it('rebaixar um admin (havendo outros) também encerra as sessões dele', async () => {
      repo.buscarPorId.mockResolvedValue(usuario({ id: 2, role: Role.ADMIN }));
      repo.contarAdminsAtivos.mockResolvedValue(3);
      repo.atualizar.mockResolvedValue(usuario({ id: 2, role: Role.USER }));
      await servico.atualizar(2, { role: Role.USER }, 1);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(2);
    });
  });
});
