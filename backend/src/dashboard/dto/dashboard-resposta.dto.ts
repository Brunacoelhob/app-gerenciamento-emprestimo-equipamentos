import { ApiProperty } from '@nestjs/swagger';

class Kpis {
  @ApiProperty({ example: 18, description: 'Equipamentos em uso (não desativados).' }) equipamentosAtivos: number;
  @ApiProperty({ example: 10, description: 'Equipamentos ativos que podem ser retirados agora.' }) disponiveis: number;
  @ApiProperty({ example: 8, description: 'Equipamentos ativos com um empréstimo em andamento.' }) emprestados: number;
  @ApiProperty({ example: 2, description: 'Equipamentos fora de uso.' }) desativados: number;
  @ApiProperty({ example: 8, description: 'Empréstimos em andamento (no escopo de quem consulta).' })
  emprestimosAtivos: number;
  @ApiProperty({ example: 3, description: 'Empréstimos em andamento com o prazo vencido.' }) atrasados: number;
  @ApiProperty({ example: 40, description: 'Retiradas feitas no período.' }) retiradasNoPeriodo: number;
  @ApiProperty({ example: 35, description: 'Devoluções feitas no período.' }) devolvidosNoPeriodo: number;
  @ApiProperty({
    example: 82,
    nullable: true,
    type: Number,
    description: '% das devoluções do período feitas dentro do prazo.',
  })
  pontualidade: number | null;
  @ApiProperty({
    example: 5.4,
    nullable: true,
    type: Number,
    description: 'Tempo médio de posse (dias) nas devoluções do período.',
  })
  tempoMedioDias: number | null;
}

class PontoDaSerie {
  @ApiProperty({ example: '2026-10-05', description: 'Dia (UTC), AAAA-MM-DD.' }) dia: string;
  @ApiProperty({ example: 3 }) retiradas: number;
  @ApiProperty({ example: 2 }) devolucoes: number;
}

class ItemDeRanking {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'Notebook Dell Latitude 5440' }) nome: string;
  @ApiProperty({ example: 7 }) total: number;
}

class EmprestimoAtrasado {
  @ApiProperty({ example: 10 }) id: number;
  @ApiProperty({ example: 'Projetor Epson PowerLite' }) equipamento: string;
  @ApiProperty({ example: 'Ana Souza' }) pessoa: string;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) prazoDevolucao: Date;
  @ApiProperty({ example: 4 }) diasDeAtraso: number;
}

export class DashboardRespostaDto {
  @ApiProperty({
    enum: ['geral', 'pessoal'],
    description: 'ADMIN vê tudo (geral); os demais veem só os próprios empréstimos (pessoal).',
  })
  escopo: 'geral' | 'pessoal';
  @ApiProperty({ example: 30 }) dias: number;
  @ApiProperty({ type: Kpis }) kpis: Kpis;
  @ApiProperty({ type: [PontoDaSerie], description: 'Um ponto por dia do período, do mais antigo ao mais recente.' })
  serie: PontoDaSerie[];
  @ApiProperty({ type: [ItemDeRanking], description: 'Equipamentos mais emprestados no período (até 5).' })
  maisEmprestados: ItemDeRanking[];
  @ApiProperty({
    type: [ItemDeRanking],
    description: 'Pessoas com mais empréstimos no período (até 5). Vazio para quem não é ADMIN.',
  })
  pessoasMaisAtivas: ItemDeRanking[];
  @ApiProperty({ type: [EmprestimoAtrasado], description: 'Os empréstimos mais atrasados (até 5).' })
  atrasados: EmprestimoAtrasado[];
  @ApiProperty({ example: '2026-10-05T12:00:00.000Z' }) geradoEm: Date;
}
