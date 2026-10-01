import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusEmprestimo } from '../../../generated/prisma/enums';
import type { EmprestimoDetalhado } from '../emprestimos.repository';

class EquipamentoResumo {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'Notebook Dell Latitude 5440' }) nome: string;
}

class UsuarioResumo {
  @ApiProperty({ example: 2 }) id: number;
  @ApiProperty({ example: 'Maria Silva' }) nome: string;
  @ApiProperty({ example: 'maria.silva@empresa.com' }) email: string;
}

export class EmprestimoRespostaDto {
  @ApiProperty({ example: 10 }) id: number;
  @ApiProperty({ enum: StatusEmprestimo, example: StatusEmprestimo.ATIVO }) status: StatusEmprestimo;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) dataRetirada: Date;
  @ApiProperty({ example: '2026-10-08T12:00:00.000Z', description: 'Combinado na retirada.' }) prazoDevolucao: Date;
  @ApiPropertyOptional({ example: null, nullable: true, type: Date }) dataDevolucao: Date | null;
  @ApiProperty({ example: false, description: 'Ainda não devolvido e com o prazo vencido.' }) atrasado: boolean;
  @ApiProperty({ type: EquipamentoResumo }) equipamento: EquipamentoResumo;
  @ApiProperty({ type: UsuarioResumo }) usuario: UsuarioResumo;
}

export function paraEmprestimoResposta(e: EmprestimoDetalhado, agora = new Date()): EmprestimoRespostaDto {
  return {
    id: e.id,
    status: e.status,
    dataRetirada: e.dataRetirada,
    prazoDevolucao: e.prazoDevolucao,
    dataDevolucao: e.dataDevolucao,
    atrasado: e.status === StatusEmprestimo.ATIVO && e.prazoDevolucao.getTime() < agora.getTime(),
    equipamento: e.equipamento,
    usuario: e.usuario,
  };
}
