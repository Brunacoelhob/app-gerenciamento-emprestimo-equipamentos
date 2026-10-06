import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusEmprestimo } from '../../../generated/prisma/enums';
import type { EmprestimoDetalhado } from '../emprestimos.repository';
import { MAX_RENOVACOES } from './renovar-emprestimo.dto';

class EquipamentoResumo {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: '9F3A1C7B2D40' }) codigo: string;
  @ApiProperty({ example: 'Notebook Dell Latitude 5440' }) nome: string;
}

class UsuarioResumo {
  @ApiProperty({ example: 2 }) id: number;
  @ApiProperty({ example: '4B7E90AA13C5' }) codigo: string;
  @ApiProperty({ example: 'Maria Silva' }) nome: string;
  @ApiProperty({ example: 'maria.silva@equipmentloan.com' }) email: string;
  @ApiPropertyOptional({ example: '11955348977', nullable: true, type: String, description: 'Só dígitos.' })
  telefone: string | null;
}

export class EmprestimoRespostaDto {
  @ApiProperty({ example: 10 }) id: number;
  @ApiProperty({ example: 'C81D5E02F6A9', description: 'Chave aleatória exibida nas telas.' }) codigo: string;
  @ApiProperty({ enum: StatusEmprestimo, example: StatusEmprestimo.ATIVO }) status: StatusEmprestimo;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) dataRetirada: Date;
  @ApiProperty({ example: '2026-10-08T12:00:00.000Z', description: 'Combinado na retirada.' }) prazoDevolucao: Date;
  @ApiPropertyOptional({ example: null, nullable: true, type: Date }) dataDevolucao: Date | null;
  @ApiProperty({ example: false, description: 'Ainda não devolvido e com o prazo vencido.' }) atrasado: boolean;
  @ApiProperty({ example: 0, description: `Vezes que o prazo foi renovado (máximo ${MAX_RENOVACOES}).` })
  renovacoes: number;
  @ApiProperty({ example: true, description: 'Ainda dá para renovar: ativo, no prazo e abaixo do limite.' })
  podeRenovar: boolean;
  @ApiProperty({ type: EquipamentoResumo }) equipamento: EquipamentoResumo;
  @ApiProperty({ type: UsuarioResumo }) usuario: UsuarioResumo;
}

export function paraEmprestimoResposta(e: EmprestimoDetalhado, agora = new Date()): EmprestimoRespostaDto {
  return {
    id: e.id,
    codigo: e.codigo,
    status: e.status,
    dataRetirada: e.dataRetirada,
    prazoDevolucao: e.prazoDevolucao,
    dataDevolucao: e.dataDevolucao,
    atrasado: e.status === StatusEmprestimo.ATIVO && e.prazoDevolucao.getTime() < agora.getTime(),
    renovacoes: e.renovacoes,
    podeRenovar:
      e.status === StatusEmprestimo.ATIVO &&
      e.renovacoes < MAX_RENOVACOES &&
      e.prazoDevolucao.getTime() >= agora.getTime(),
    equipamento: e.equipamento,
    usuario: { ...e.usuario, telefone: e.usuario.telefone },
  };
}
