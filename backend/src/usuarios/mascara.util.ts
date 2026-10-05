// Minimização de dados pessoais (LGPD): quem administra contas não precisa ver o CPF, o telefone nem o endereço
// completos de ninguém. As telas e rotas de ADMIN recebem estes campos mascarados; a própria pessoa vê tudo no
// perfil dela.

/** 52998224725 -> ***.***.***-25 */
export function mascararCpf(cpf: string | null): string | null {
  return cpf && cpf.length === 11 ? `***.***.***-${cpf.slice(9)}` : cpf ? '***' : null;
}

/** 11987654321 -> (11) *****-4321 */
export function mascararTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  if (telefone.length < 10) return '***';
  return `(${telefone.slice(0, 2)}) *****-${telefone.slice(-4)}`;
}

interface ComDadosPessoais {
  cpf: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
}

/** Mascara CPF e telefone e remove o endereço de rua (fica só cidade e UF) de um usuário. */
export function minimizarParaAdmin<T extends ComDadosPessoais>(usuario: T): T {
  return {
    ...usuario,
    cpf: mascararCpf(usuario.cpf),
    telefone: mascararTelefone(usuario.telefone),
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
  };
}
