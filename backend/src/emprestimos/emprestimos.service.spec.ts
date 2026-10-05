import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, StatusEmprestimo } from '../../generated/prisma/enums';
import { EmprestimosRepository, EmprestimoDetalhado } from './emprestimos.repository';
import { EmprestimosService } from './emprestimos.service';

const DIA = 86_400_000;

function emprestimo(sobrescrever: Partial<EmprestimoDetalhado> = {}): EmprestimoDetalhado {
  return {
    id: 10,
    usuarioId: 1,
    equipamentoId: 5,
    status: StatusEmprestimo.ATIVO,
    dataRetirada: new Date(),
    prazoDevolucao: new Date(Date.now() + 7 * DIA),
    dataDevolucao: null,
    lembreteEnviadoEm: null,
    ultimoAvisoAtrasoEm: null,
    equipamento: { id: 5, nome: 'Notebook' },
    usuario: { id: 1, nome: 'Maria', email: 'maria@teste.com' },
    ...sobrescrever,
  };
}

describe('EmprestimosService', () => {
  let repo: jest.Mocked<EmprestimosRepository>;
  let servico: EmprestimosService;

  beforeEach(() => {
    repo = {
      criarSeDisponivel: jest.fn(),
      buscarPorId: jest.fn(),
      marcarDevolvido: jest.fn(),
      listar: jest.fn(),
    } as unknown as jest.Mocked<EmprestimosRepository>;
    servico = new EmprestimosService(repo);
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
});
