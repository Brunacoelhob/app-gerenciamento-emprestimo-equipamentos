import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { intervalo, montarPagina } from '../common/dto/pagina';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { CriarEmprestimoDto, PRAZO_PADRAO_DIAS } from './dto/criar-emprestimo.dto';
import { MAX_RENOVACOES, PRAZO_RENOVACAO_PADRAO_DIAS, RenovarEmprestimoDto } from './dto/renovar-emprestimo.dto';
import { paraEmprestimoResposta } from './dto/emprestimo-resposta.dto';
import { ListarEmprestimosDto, ListarMeusEmprestimosDto } from './dto/listar-emprestimos.dto';
import { ConfigService } from '@nestjs/config';
import {
  ArquivoRelatorio,
  formatadoresDeData,
  FormatoRelatorio,
  LIMITE_RELATORIO_LISTAS,
  RelatoriosService,
} from '../relatorios/relatorios.service';
import { ReservasService } from '../reservas/reservas.service';
import { EmprestimosRepository, FiltroEmprestimos } from './emprestimos.repository';

const MS_POR_DIA = 24 * 3_600_000;

// Regras de negócio dos empréstimos. A garantia de que ninguém pega o mesmo item ao mesmo tempo
// NÃO está aqui em um "if": está no repositório (trava + índice único), onde pedidos simultâneos não conseguem burlá-la.
@Injectable()
export class EmprestimosService {
  constructor(
    private readonly emprestimos: EmprestimosRepository,
    private readonly relatorios: RelatoriosService,
    private readonly config: ConfigService,
    private readonly reservas: ReservasService,
  ) {}

  async criar(usuarioId: number, dto: CriarEmprestimoDto) {
    const prazo = new Date(Date.now() + (dto.dias ?? PRAZO_PADRAO_DIAS) * MS_POR_DIA);
    const resultado = await this.emprestimos.criarSeDisponivel(usuarioId, dto.equipamentoId, prazo);

    switch (resultado.tipo) {
      case 'criado':
        await this.reservas.atendida(usuarioId, dto.equipamentoId); // saiu da fila dele, se estava
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
    this.reservas.avisarProximo(emprestimo.equipamento.id); // quem espera na fila é avisado

    return paraEmprestimoResposta((await this.emprestimos.buscarPorId(emprestimoId))!);
  }

  /** Estende o prazo (o dono ou um ADMIN), até MAX_RENOVACOES vezes e só antes de vencer. */
  async renovar(usuario: UsuarioAutenticado, emprestimoId: number, dto: RenovarEmprestimoDto) {
    const emprestimo = await this.emprestimos.buscarPorId(emprestimoId);
    if (!emprestimo) throw new NotFoundException('Empréstimo não encontrado.');
    if (emprestimo.usuario.id !== usuario.id && usuario.role !== Role.ADMIN) {
      throw new ForbiddenException('Você só pode renovar os seus próprios empréstimos.');
    }
    // Mensagens específicas para o caso comum; a garantia de verdade é o UPDATE condicional abaixo
    if (emprestimo.status !== 'ATIVO') throw new ConflictException('Este empréstimo já foi devolvido.');
    if (emprestimo.prazoDevolucao.getTime() < Date.now()) {
      throw new ConflictException('O prazo já venceu e não pode mais ser renovado. Devolva o equipamento.');
    }
    if (emprestimo.renovacoes >= MAX_RENOVACOES) {
      throw new ConflictException(`Este empréstimo já foi renovado ${MAX_RENOVACOES} vezes, o limite permitido.`);
    }

    const renovado = await this.emprestimos.renovar(
      emprestimoId,
      dto.dias ?? PRAZO_RENOVACAO_PADRAO_DIAS,
      MAX_RENOVACOES,
      new Date(),
    );
    if (!renovado) throw new ConflictException('Não foi possível renovar agora. Atualize a página e tente de novo.');

    return paraEmprestimoResposta((await this.emprestimos.buscarPorId(emprestimoId))!);
  }

  async listarMeus(usuarioId: number, dto: ListarMeusEmprestimosDto) {
    const { total, itens } = await this.emprestimos.listar(
      { usuarioId, status: dto.status, atrasados: dto.atrasados, busca: dto.busca },
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
      {
        usuarioId: dto.usuarioId,
        equipamentoId: dto.equipamentoId,
        status: dto.status,
        atrasados: dto.atrasados,
        busca: dto.busca,
        buscarPessoa: true,
      },
      intervalo(dto),
    );
    return montarPagina(
      itens.map((e) => paraEmprestimoResposta(e)),
      total,
      dto,
    );
  }

  /** Relatório dos empréstimos de uma pessoa (ou de todos, para o ADMIN), com os mesmos filtros da tela. */
  async exportar(
    formato: FormatoRelatorio,
    filtro: FiltroEmprestimos,
    titulo: string,
  ): Promise<{ arquivo: ArquivoRelatorio; total: number; cortado: boolean }> {
    const { total, itens } = await this.emprestimos.listar(filtro, { skip: 0, take: LIMITE_RELATORIO_LISTAS });
    const cortado = total > itens.length;
    const f = formatadoresDeData(this.config.getOrThrow<string>('notificacoesFuso'));
    const arquivo = await this.relatorios.gerar(formato, {
      titulo,
      subtitulo:
        `Gerado em ${f.agora()}. ` +
        (cortado
          ? `ATENÇÃO: o filtro tem ${total} empréstimos e este arquivo traz só os ${itens.length} mais recentes.`
          : `${total} ${total === 1 ? 'empréstimo' : 'empréstimos'}.`),
      colunas: [
        { chave: 'codigo', titulo: 'Código', largura: 14 },
        { chave: 'equipamento', titulo: 'Equipamento', largura: 26 },
        { chave: 'pessoa', titulo: 'Pessoa', largura: 22 },
        { chave: 'email', titulo: 'E-mail', largura: 30 },
        { chave: 'retirada', titulo: 'Retirada', largura: 11 },
        { chave: 'prazo', titulo: 'Prazo', largura: 11 },
        { chave: 'devolucao', titulo: 'Devolução', largura: 11 },
        { chave: 'situacao', titulo: 'Situação', largura: 13 },
      ],
      linhas: itens.map((e) => {
        const r = paraEmprestimoResposta(e);
        return {
          codigo: e.codigo,
          equipamento: e.equipamento.nome,
          pessoa: e.usuario.nome,
          email: e.usuario.email,
          retirada: f.data(e.dataRetirada),
          prazo: f.data(e.prazoDevolucao),
          devolucao: f.data(e.dataDevolucao),
          situacao: e.status === 'DEVOLVIDO' ? 'Devolvido' : r.atrasado ? 'Atrasado' : 'Em andamento',
        };
      }),
    });
    return { arquivo, total, cortado };
  }
}
