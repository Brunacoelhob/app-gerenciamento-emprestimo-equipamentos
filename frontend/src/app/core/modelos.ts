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
  Pick<Usuario, 'nome' | 'email' | 'cpf' | 'telefone' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'avatar'>
>;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
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
  nome: string;
  descricao: string | null;
  ativo: boolean;
  emprestado: boolean;
  disponivel: boolean;
  criadoEm: string;
}

export type StatusEmprestimo = 'ATIVO' | 'DEVOLVIDO';

export interface Emprestimo {
  id: number;
  status: StatusEmprestimo;
  dataRetirada: string;
  prazoDevolucao: string;
  dataDevolucao: string | null;
  atrasado: boolean;
  equipamento: { id: number; nome: string };
  usuario: { id: number; nome: string; email: string };
}
