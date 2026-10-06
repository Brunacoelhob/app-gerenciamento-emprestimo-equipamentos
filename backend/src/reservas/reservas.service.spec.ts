import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../generated/prisma/enums';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { EmailService } from '../email/email.service';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

const ana = { id: 1, role: Role.USER } as UsuarioAutenticado;
const admin = { id: 9, role: Role.ADMIN } as UsuarioAutenticado;

function equipamento(sobrescrever: object = {}) {
  return { id: 5, nome: 'Notebook', ativo: true, emprestimos: [{ usuarioId: 2 }], ...sobrescrever };
}

describe('ReservasService', () => {
  let repo: jest.Mocked<ReservasRepository>;
  let email: { enviar: jest.Mock };
  let servico: ReservasService;

  beforeEach(() => {
    repo = {
      buscarEquipamento: jest.fn(),
      criar: jest.fn(),
      minhas: jest.fn(),
      buscarPorId: jest.fn(),
      cancelar: jest.fn(),
      primeiroDaFila: jest.fn(),
      registrarAviso: jest.fn(),
    } as unknown as jest.Mocked<ReservasRepository>;
    email = { enviar: jest.fn().mockResolvedValue(undefined) };
    const config = { getOrThrow: () => 'http://localhost:4200' } as unknown as ConfigService;
    servico = new ReservasService(repo, email as unknown as EmailService, config);
  });

  describe('criar', () => {
    it('entra na fila de um equipamento emprestado a outra pessoa e recebe a posição', async () => {
      repo.buscarEquipamento.mockResolvedValue(equipamento());
      repo.criar.mockResolvedValue({ id: 7 } as never);
      repo.minhas.mockResolvedValue([
        { id: 7, criadoEm: new Date(), posicao: 3, equipamento: { id: 5, codigo: 'ABC', nome: 'Notebook' } },
      ] as never);
      const r = await servico.criar(ana, { equipamentoId: 5 });
      expect(r.posicao).toBe(3);
    });

    it('recusa: inexistente, fora de uso, disponível e já está com a própria pessoa', async () => {
      repo.buscarEquipamento.mockResolvedValue(null);
      await expect(servico.criar(ana, { equipamentoId: 5 })).rejects.toBeInstanceOf(NotFoundException);

      repo.buscarEquipamento.mockResolvedValue(equipamento({ ativo: false }));
      await expect(servico.criar(ana, { equipamentoId: 5 })).rejects.toThrow(/fora de uso/);

      repo.buscarEquipamento.mockResolvedValue(equipamento({ emprestimos: [] }));
      await expect(servico.criar(ana, { equipamentoId: 5 })).rejects.toThrow(/disponível/);

      repo.buscarEquipamento.mockResolvedValue(equipamento({ emprestimos: [{ usuarioId: 1 }] }));
      await expect(servico.criar(ana, { equipamentoId: 5 })).rejects.toThrow(/já está com este/);
      expect(repo.criar).not.toHaveBeenCalled();
    });
  });

  describe('cancelar', () => {
    it('a própria pessoa e o ADMIN saem da fila; outra pessoa não', async () => {
      repo.buscarPorId.mockResolvedValue({ id: 7, usuarioId: 1 } as never);
      repo.cancelar.mockResolvedValue(true);
      await expect(servico.cancelar(ana, 7)).resolves.toBeUndefined();
      await expect(servico.cancelar(admin, 7)).resolves.toBeUndefined();
      await expect(servico.cancelar({ id: 3, role: Role.USER }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 se não existe e 409 se já tinha saído da fila', async () => {
      repo.buscarPorId.mockResolvedValue(null);
      await expect(servico.cancelar(ana, 7)).rejects.toBeInstanceOf(NotFoundException);
      repo.buscarPorId.mockResolvedValue({ id: 7, usuarioId: 1 } as never);
      repo.cancelar.mockResolvedValue(false);
      await expect(servico.cancelar(ana, 7)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('avisarProximo', () => {
    const esperar = () => new Promise((r) => setTimeout(r, 20));

    it('manda e-mail ao primeiro da fila e registra o aviso', async () => {
      repo.primeiroDaFila.mockResolvedValue({
        id: 7,
        usuario: { nome: 'Ana', email: 'ana@teste.com' },
        equipamento: { nome: 'Notebook' },
      } as never);
      servico.avisarProximo(5);
      await esperar();
      expect(repo.registrarAviso).toHaveBeenCalledWith(7, expect.any(Date));
      expect(email.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: 'ana@teste.com' }));
    });

    it('fila vazia não manda nada, e falha de e-mail não vira erro para quem devolveu', async () => {
      repo.primeiroDaFila.mockResolvedValue(null);
      servico.avisarProximo(5);
      await esperar();
      expect(email.enviar).not.toHaveBeenCalled();

      repo.primeiroDaFila.mockResolvedValue({
        id: 7,
        usuario: { nome: 'Ana', email: 'ana@teste.com' },
        equipamento: { nome: 'Notebook' },
      } as never);
      email.enviar.mockRejectedValue(new Error('SMTP fora do ar'));
      expect(() => servico.avisarProximo(5)).not.toThrow();
      await esperar();
    });
  });
});
