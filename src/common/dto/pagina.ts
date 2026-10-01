import { ApiProperty } from '@nestjs/swagger';

export class MetaPagina {
  @ApiProperty({ example: 57, description: 'Total de itens que atendem aos filtros.' }) total: number;
  @ApiProperty({ example: 1 }) pagina: number;
  @ApiProperty({ example: 20 }) limite: number;
  @ApiProperty({ example: 3 }) totalPaginas: number;
}

// Envelope padrão das listagens: os itens da página e os metadados para navegar.
export interface Pagina<T> {
  itens: T[];
  meta: MetaPagina;
}

// Converte página/limite no skip/take do Prisma.
export function intervalo({ pagina, limite }: { pagina: number; limite: number }) {
  return { skip: (pagina - 1) * limite, take: limite };
}

export function montarPagina<T>(
  itens: T[],
  total: number,
  { pagina, limite }: { pagina: number; limite: number },
): Pagina<T> {
  return { itens, meta: { total, pagina, limite, totalPaginas: Math.max(1, Math.ceil(total / limite)) } };
}
