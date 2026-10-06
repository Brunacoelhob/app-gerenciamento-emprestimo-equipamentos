export type Role = 'ADMIN' | 'USER';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  cpf: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  avatar: string | null;
  criadoEm: string;
}

// Campos editáveis do próprio perfil ("" ou null apaga os opcionais)
export type DadosPerfil = Partial<
  Pick<
    Usuario,
    | 'nome'
    | 'email'
    | 'cpf'
    | 'telefone'
    | 'cep'
    | 'logradouro'
    | 'numero'
    | 'complemento'
    | 'bairro'
    | 'cidade'
    | 'uf'
    | 'avatar'
  >
>;

export interface Tokens {
  accessToken: string;
  tipo: 'Bearer';
  accessTokenExpiraEm: string;
}

// Formato padrão de erro da API (HttpExceptionFilter)
export interface ErroApi {
  statusCode: number;
  erro: string;
  mensagem: string | string[];
}

export interface MetaPagina {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface Pagina<T> {
  itens: T[];
  meta: MetaPagina;
}

export interface Equipamento {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  emprestado: boolean;
  disponivel: boolean;
  fotoVersao: number | null;
  fila: number;
  reservado: boolean;
  criadoEm: string;
}

export interface Reserva {
  id: number;
  criadoEm: string;
  posicao: number;
  minhaVez: boolean;
  prioridadeAte: string | null;
  equipamento: { id: number; codigo: string; nome: string };
}

export type StatusEmprestimo = 'ATIVO' | 'DEVOLVIDO';

export interface Emprestimo {
  id: number;
  codigo: string;
  status: StatusEmprestimo;
  dataRetirada: string;
  prazoDevolucao: string;
  dataDevolucao: string | null;
  atrasado: boolean;
  renovacoes: number;
  podeRenovar: boolean;
  equipamento: { id: number; codigo: string; nome: string };
  usuario: { id: number; codigo: string; nome: string; email: string; telefone: string | null };
}

export interface DashboardKpis {
  equipamentosAtivos: number;
  disponiveis: number;
  emprestados: number;
  desativados: number;
  emprestimosAtivos: number;
  atrasados: number;
  retiradasNoPeriodo: number;
  devolvidosNoPeriodo: number;
  pontualidade: number | null;
  tempoMedioDias: number | null;
}

export interface ItemRanking {
  id: number;
  nome: string;
  total: number;
}

export interface Dashboard {
  escopo: 'geral' | 'pessoal';
  dias: number;
  kpis: DashboardKpis;
  serie: { dia: string; retiradas: number; devolucoes: number }[];
  maisEmprestados: ItemRanking[];
  pessoasMaisAtivas: ItemRanking[];
  atrasados: {
    id: number;
    equipamento: string;
    pessoa: string;
    prazoDevolucao: string;
    diasDeAtraso: number;
  }[];
  geradoEm: string;
}
