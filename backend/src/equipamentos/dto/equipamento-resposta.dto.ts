import { ApiProperty } from '@nestjs/swagger';
import type { EquipamentoComSituacao } from '../equipamentos.repository';

export class EquipamentoRespostaDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: '9F3A1C7B2D40', description: 'Chave aleatória exibida nas telas.' }) codigo: string;
  @ApiProperty({ example: 'Notebook Dell Latitude 5440' }) nome: string;
  @ApiProperty({ example: 'Notebook i5, 16GB RAM, para uso em campo', nullable: true, type: String }) descricao:
    string | null;
  @ApiProperty({ example: true, description: 'Equipamento fora de uso (desativado) não pode ser retirado.' })
  ativo: boolean;
  @ApiProperty({ example: false, description: 'Existe um empréstimo ativo. Valor derivado, nunca fica desatualizado.' })
  emprestado: boolean;
  @ApiProperty({ example: true, description: 'Pode ser retirado agora: ativo e não emprestado.' }) disponivel: boolean;
  @ApiProperty({ example: 2, description: 'Quantas pessoas esperam na fila deste equipamento.' }) fila: number;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) criadoEm: Date;
}

export function paraEquipamentoResposta(e: EquipamentoComSituacao, fila = 0): EquipamentoRespostaDto {
  const emprestado = e.emprestimos.length > 0;
  return {
    id: e.id,
    codigo: e.codigo,
    nome: e.nome,
    descricao: e.descricao,
    ativo: e.ativo,
    emprestado,
    disponivel: e.ativo && !emprestado,
    fila,
    criadoEm: e.criadoEm,
  };
}
