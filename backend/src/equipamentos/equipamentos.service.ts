import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { intervalo, montarPagina } from '../common/dto/pagina';
import { AtualizarEquipamentoDto } from './dto/atualizar-equipamento.dto';
import { CriarEquipamentoDto } from './dto/criar-equipamento.dto';
import { paraEquipamentoResposta } from './dto/equipamento-resposta.dto';
import { ListarEquipamentosDto } from './dto/listar-equipamentos.dto';
import { ConfigService } from '@nestjs/config';
import {
  formatadoresDeData,
  FormatoRelatorio,
  LIMITE_RELATORIO_LISTAS,
  RelatoriosService,
} from '../relatorios/relatorios.service';
import { ReservasService } from '../reservas/reservas.service';
import { EquipamentosRepository } from './equipamentos.repository';

@Injectable()
export class EquipamentosService {
  constructor(
    private readonly equipamentos: EquipamentosRepository,
    private readonly relatorios: RelatoriosService,
    private readonly config: ConfigService,
    private readonly reservas: ReservasService,
  ) {}

  async criar(dto: CriarEquipamentoDto) {
    return paraEquipamentoResposta(await this.equipamentos.criar(dto));
  }

  async listar(dto: ListarEquipamentosDto) {
    const { total, itens } = await this.equipamentos.listar(
      { ativo: dto.ativo, emprestado: dto.emprestado, busca: dto.busca },
      intervalo(dto),
    );
    const filas = await this.reservas.tamanhoDasFilas(itens.map((i) => i.id));
    return montarPagina(
      itens.map((i) => paraEquipamentoResposta(i, filas.get(i.id) ?? 0)),
      total,
      dto,
    );
  }

  /** Relatório do acervo, com os mesmos filtros da tela. */
  async exportar(dto: ListarEquipamentosDto, formato: FormatoRelatorio) {
    const { total, itens } = await this.equipamentos.listar(
      { ativo: dto.ativo, emprestado: dto.emprestado, busca: dto.busca },
      { skip: 0, take: LIMITE_RELATORIO_LISTAS },
    );
    const cortado = total > itens.length;
    const f = formatadoresDeData(this.config.getOrThrow<string>('notificacoesFuso'));
    const arquivo = await this.relatorios.gerar(formato, {
      titulo: 'Relatório de equipamentos',
      subtitulo:
        `Gerado em ${f.agora()}. ` +
        (cortado
          ? `ATENÇÃO: o filtro tem ${total} equipamentos e este arquivo traz só os ${itens.length} primeiros.`
          : `${total} ${total === 1 ? 'equipamento' : 'equipamentos'}.`),
      colunas: [
        { chave: 'codigo', titulo: 'Código', largura: 14 },
        { chave: 'nome', titulo: 'Equipamento', largura: 30 },
        { chave: 'descricao', titulo: 'Descrição', largura: 40 },
        { chave: 'situacao', titulo: 'Situação', largura: 14 },
        { chave: 'cadastro', titulo: 'Cadastro', largura: 11 },
      ],
      linhas: itens.map(paraEquipamentoResposta).map((e) => ({
        codigo: e.codigo,
        nome: e.nome,
        descricao: e.descricao,
        situacao: !e.ativo ? 'Desativado' : e.emprestado ? 'Emprestado' : 'Disponível',
        cadastro: f.data(e.criadoEm),
      })),
    });
    return { arquivo, total, cortado };
  }

  async obter(id: number) {
    const equipamento = await this.equipamentos.buscarPorId(id);
    if (!equipamento) throw new NotFoundException('Equipamento não encontrado.');
    return paraEquipamentoResposta(equipamento);
  }

  async atualizar(id: number, dto: AtualizarEquipamentoDto) {
    const atual = await this.equipamentos.buscarPorId(id);
    if (!atual) throw new NotFoundException('Equipamento não encontrado.');

    // Tirar de uso é uma operação protegida contra retirada simultânea (ver o repositório).
    if (dto.ativo === false && atual.ativo) {
      const resultado = await this.equipamentos.desativarSeLivre(id);
      if (resultado === 'emprestado') {
        throw new ConflictException('Este equipamento está emprestado e não pode ser desativado. Aguarde a devolução.');
      }
      if (resultado === 'inexistente') throw new NotFoundException('Equipamento não encontrado.');
    }

    const { ativo, ...resto } = dto;
    const dados = { ...resto, ...(ativo === true && { ativo: true }) };
    const atualizado =
      Object.keys(dados).length > 0
        ? await this.equipamentos.atualizar(id, dados)
        : await this.equipamentos.buscarPorId(id);
    return paraEquipamentoResposta(atualizado!);
  }
}
