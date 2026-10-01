import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { intervalo, montarPagina } from '../common/dto/pagina';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { CriarEmprestimoDto, PRAZO_PADRAO_DIAS } from './dto/criar-emprestimo.dto';
import { paraEmprestimoResposta } from './dto/emprestimo-resposta.dto';
import { ListarEmprestimosDto, ListarMeusEmprestimosDto } from './dto/listar-emprestimos.dto';
import { EmprestimosRepository } from './emprestimos.repository';

const MS_POR_DIA = 24 * 3_600_000;

// Regras de negócio dos empréstimos. A garantia de que ninguém pega o mesmo item ao mesmo tempo
// NÃO está aqui em um "if": está no repositório (trava + índice único), onde pedidos simultâneos não conseguem burlá-la.
@Injectable()
export class EmprestimosService {
  constructor(private readonly emprestimos: EmprestimosRepository) {}

  async criar(usuarioId: number, dto: CriarEmprestimoDto) {
    const prazo = new Date(Date.now() + (dto.dias ?? PRAZO_PADRAO_DIAS) * MS_POR_DIA);
    const resultado = await this.emprestimos.criarSeDisponivel(usuarioId, dto.equipamentoId, prazo);

    switch (resultado.tipo) {
      case 'criado':
        return paraEmprestimoResposta(resultado.emprestimo);
      case 'inexistente':
        throw new NotFoundException('Equipamento não encontrado.');
      case 'inativo':
        throw new ConflictException('Este equipamento está fora de uso e não pode ser retirado.');
      case 'indisponivel':
        throw new ConflictException('Este equipamento já está emprestado.');
    }
  }

  async devolver(usuario: UsuarioAutenticado, emprestimoId: number) {
    const emprestimo = await this.emprestimos.buscarPorId(emprestimoId);
    if (!emprestimo) throw new NotFoundException('Empréstimo não encontrado.');

    if (emprestimo.usuario.id !== usuario.id && usuario.role !== Role.ADMIN) {
      throw new ForbiddenException('Você só pode devolver os seus próprios empréstimos.');
    }

    // A condição "ainda ATIVO" está dentro do UPDATE: só uma devolução vence, mesmo com várias ao mesmo tempo.
    const devolvido = await this.emprestimos.marcarDevolvido(emprestimoId, new Date());
    if (!devolvido) throw new ConflictException('Este empréstimo já foi devolvido.');

    return paraEmprestimoResposta((await this.emprestimos.buscarPorId(emprestimoId))!);
  }

  async listarMeus(usuarioId: number, dto: ListarMeusEmprestimosDto) {
    const { total, itens } = await this.emprestimos.listar(
      { usuarioId, status: dto.status, atrasados: dto.atrasados },
      intervalo(dto),
    );
    return montarPagina(
      itens.map((e) => paraEmprestimoResposta(e)),
      total,
      dto,
    );
  }

  /** Visão do ADMIN: todos os empréstimos, com filtros por pessoa, equipamento, status e atraso. */
  async listarTodos(dto: ListarEmprestimosDto) {
    const { total, itens } = await this.emprestimos.listar(
      { usuarioId: dto.usuarioId, equipamentoId: dto.equipamentoId, status: dto.status, atrasados: dto.atrasados },
      intervalo(dto),
    );
    return montarPagina(
      itens.map((e) => paraEmprestimoResposta(e)),
      total,
      dto,
    );
  }
}
