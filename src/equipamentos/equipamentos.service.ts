import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { intervalo, montarPagina } from '../common/dto/pagina';
import { AtualizarEquipamentoDto } from './dto/atualizar-equipamento.dto';
import { CriarEquipamentoDto } from './dto/criar-equipamento.dto';
import { paraEquipamentoResposta } from './dto/equipamento-resposta.dto';
import { ListarEquipamentosDto } from './dto/listar-equipamentos.dto';
import { EquipamentosRepository } from './equipamentos.repository';

@Injectable()
export class EquipamentosService {
  constructor(private readonly equipamentos: EquipamentosRepository) {}

  async criar(dto: CriarEquipamentoDto) {
    return paraEquipamentoResposta(await this.equipamentos.criar(dto));
  }

  async listar(dto: ListarEquipamentosDto) {
    const { total, itens } = await this.equipamentos.listar(
      { ativo: dto.ativo, emprestado: dto.emprestado, busca: dto.busca },
      intervalo(dto),
    );
    return montarPagina(itens.map(paraEquipamentoResposta), total, dto);
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
