import { ConfigService } from '@nestjs/config';
import { ReservasService } from '../reservas/reservas.service';
import { RelatoriosService } from '../relatorios/relatorios.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, StatusEmprestimo } from '../../generated/prisma/enums';
import { EmprestimosRepository, EmprestimoDetalhado } from './emprestimos.repository';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { EmprestimosService } from './emprestimos.service';

const DIA = 86_400_000;

function emprestimo(sobrescrever: Partial<EmprestimoDetalhado> = {}): EmprestimoDetalhado {
  return {
    id: 10,
    codigo: 'C81D5E02F6A9',
    usuarioId: 1,
    equipamentoId: 5,
    status: StatusEmprestimo.ATIVO,
    dataRetirada: new Date(),
    prazoDevolucao: new Date(Date.now() + 7 * DIA),
    dataDevolucao: null,
    renovacoes: 0,
    lembreteEnviadoEm: null,
    ultimoAvisoAtrasoEm: null,
    equipamento: { id: 5, codigo: '9F3A1C7B2D40', nome: 'Notebook' },
    usuario: { id: 1, codigo: '4B7E90AA13C5', nome: 'Maria', email: 'maria@teste.com', telefone: null },
    ...sobrescrever,
  };
}

describe('EmprestimosService', () => {
  let repo: jest.Mocked<EmprestimosRepository>;
  let servico: EmprestimosService;
  let relatorios: { gerar: jest.Mock };
  let reservas: { atendida: jest.Mock; avisarProximo: jest.Mock };

  beforeEach(() => {
    repo = {
      criarSeDisponivel: jest.fn(),
      buscarPorId: jest.fn(),
      marcarDevolvido: jest.fn(),
      listar: jest.fn(),
      renovar: jest.fn(),
    } as unknown as jest.Mocked<EmprestimosRepository>;
    relatorios = {
      gerar: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), tipo: 'text/csv', extensao: 'csv' }),
    };
    reservas = { atendida: jest.fn().mockResolvedValue(undefined), avisarProximo: jest.fn() };
    const config = { getOrThrow: () => 'America/Sao_Paulo' } as unknown as ConfigService;
    servico = new EmprestimosService(
      repo,
      relatorios as unknown as RelatoriosService,
      config,
      reservas as unknown as ReservasService,
    );
  });

  describe('criar', () => {
    it('usa o prazo padrão de 7 dias quando não é informado', async () => {
      repo.criarSeDisponivel.mockResolvedValue({ tipo: 'criado', emprestimo: emprestimo() });
      await servico.criar(1, { equipamentoId: 5 });

      const prazo = repo.criarSeDisponivel.mock.calls[0][2];
      expect(Math.round((prazo.getTime() - Date.now()) / DIA)).toBe(7);
    });

    it('respeita o prazo pedido', async () => {
      repo.criarSeDisponivel.mockResolvedValue({ tipo: 'criado', emprestimo: emprestimo() });
      await servico.criar(1, { equipamentoId: 5, dias: 2 });
      expect(Math.round((repo.criarSeDisponivel.mock.calls[0][2].getTime() - Date.now()) / DIA)).toBe(2);
    });

    it('traduz cada resultado do repositório no erro HTTP certo', async () => {
      repo.criarSeDisponivel.mockResolvedValueOnce({ tipo: 'inexistente' });
      await expect(servico.criar(1, { equipamentoId: 9 })).rejects.toBeInstanceOf(NotFoundException);

      repo.criarSeDisponivel.mockResolvedValueOnce({ tipo: 'inativo' });
      await expect(servico.criar(1, { equipamentoId: 9 })).rejects.toThrow('fora de uso');

      repo.criarSeDisponivel.mockResolvedValueOnce({ tipo: 'indisponivel' });
      await expect(servico.criar(1, { equipamentoId: 9 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('a resposta marca o empréstimo como atrasado só se o prazo venceu', async () => {
      repo.criarSeDisponivel.mockResolvedValue({ tipo: 'criado', emprestimo: emprestimo() });
      expect((await servico.criar(1, { equipamentoId: 5 })).atrasado).toBe(false);

      repo.criarSeDisponivel.mockResolvedValue({
        tipo: 'criado',
        emprestimo: emprestimo({ prazoDevolucao: new Date(Date.now() - 1000) }),
      });
      expect((await servico.criar(1, { equipamentoId: 5 })).atrasado).toBe(true);
    });
  });

  describe('devolver', () => {
    it('o dono devolve', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      repo.marcarDevolvido.mockResolvedValue(true);
      await expect(servico.devolver({ id: 1, role: Role.USER }, 10)).resolves.toBeDefined();
      expect(repo.marcarDevolvido).toHaveBeenCalledWith(10, expect.any(Date));
      expect(reservas.avisarProximo).toHaveBeenCalledWith(5); // quem está na fila é avisado
    });

    it('outro USER não devolve o empréstimo alheio, e nada é alterado', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      await expect(servico.devolver({ id: 2, role: Role.USER }, 10)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.marcarDevolvido).not.toHaveBeenCalled();
    });

    it('um ADMIN devolve o de qualquer pessoa', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      repo.marcarDevolvido.mockResolvedValue(true);
      await expect(servico.devolver({ id: 99, role: Role.ADMIN }, 10)).resolves.toBeDefined();
    });

    it('inexistente dá 404 e já devolvido (ou perdeu a corrida) dá 409', async () => {
      repo.buscarPorId.mockResolvedValueOnce(null);
      await expect(servico.devolver({ id: 1, role: Role.USER }, 10)).rejects.toBeInstanceOf(NotFoundException);

      repo.buscarPorId.mockResolvedValueOnce(emprestimo());
      repo.marcarDevolvido.mockResolvedValueOnce(false); // outro pedido devolveu primeiro
      await expect(servico.devolver({ id: 1, role: Role.USER }, 10)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listagens', () => {
    it('"meus" sempre filtra pelo usuário autenticado (nunca por um id enviado)', async () => {
      repo.listar.mockResolvedValue({ total: 0, itens: [] });
      await servico.listarMeus(7, { pagina: 1, limite: 20 });
      expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }), { skip: 0, take: 20 });
    });

    it('devolve itens e metadados de paginação', async () => {
      repo.listar.mockResolvedValue({ total: 45, itens: [emprestimo()] });
      const r = await servico.listarTodos({ pagina: 2, limite: 20 });
      expect(r.meta).toEqual({ total: 45, pagina: 2, limite: 20, totalPaginas: 3 });
      expect(repo.listar).toHaveBeenCalledWith(expect.anything(), { skip: 20, take: 20 });
    });
  });

  describe('exportar', () => {
    it('monta as linhas do relatório com data formatada e a situação em português', async () => {
      repo.listar.mockResolvedValue({ total: 1, itens: [emprestimo()] });
      const r = await servico.exportar('csv', {}, 'Relatório de empréstimos');
      expect(r.total).toBe(1);
      expect(r.cortado).toBe(false);
      const dados = relatorios.gerar.mock.calls[0][1] as { linhas: Record<string, string>[]; titulo: string };
      expect(dados.titulo).toBe('Relatório de empréstimos');
      expect(dados.linhas[0]).toMatchObject({ equipamento: 'Notebook', pessoa: 'Maria', situacao: 'Em andamento' });
      expect(dados.linhas[0].retirada).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('avisa quando o filtro tem mais registros do que o arquivo comporta', async () => {
      repo.listar.mockResolvedValue({ total: 9000, itens: [emprestimo()] });
      const r = await servico.exportar('csv', {}, 'x');
      expect(r.cortado).toBe(true);
    });
  });

  describe('renovar', () => {
    const dono = { id: 1, role: 'USER' } as UsuarioAutenticado;
    const outro = { id: 99, role: 'USER' } as UsuarioAutenticado;
    const admin = { id: 50, role: 'ADMIN' } as UsuarioAutenticado;

    it('renova o próprio empréstimo, com 7 dias por padrão e o limite de 2 vezes', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      repo.renovar.mockResolvedValue(true);
      await servico.renovar(dono, 10, {});
      expect(repo.renovar).toHaveBeenCalledWith(10, 7, 2, expect.any(Date));
    });

    it('um ADMIN pode renovar o de outra pessoa; uma pessoa comum não', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      repo.renovar.mockResolvedValue(true);
      await expect(servico.renovar(admin, 10, { dias: 3 })).resolves.toBeDefined();
      await expect(servico.renovar(outro, 10, {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('recusa quando já devolvido, vencido ou no limite de renovações', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo({ status: StatusEmprestimo.DEVOLVIDO }));
      await expect(servico.renovar(dono, 10, {})).rejects.toBeInstanceOf(ConflictException);

      repo.buscarPorId.mockResolvedValue(emprestimo({ prazoDevolucao: new Date(Date.now() - DIA) }));
      await expect(servico.renovar(dono, 10, {})).rejects.toThrow(/venceu/);

      repo.buscarPorId.mockResolvedValue(emprestimo({ renovacoes: 2 }));
      await expect(servico.renovar(dono, 10, {})).rejects.toThrow(/limite/);
      expect(repo.renovar).not.toHaveBeenCalled();
    });

    it('perdendo a corrida no banco (outra renovação passou antes), devolve 409', async () => {
      repo.buscarPorId.mockResolvedValue(emprestimo());
      repo.renovar.mockResolvedValue(false);
      await expect(servico.renovar(dono, 10, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('empréstimo inexistente é 404', async () => {
      repo.buscarPorId.mockResolvedValue(null);
      await expect(servico.renovar(dono, 10, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
