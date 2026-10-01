// Normaliza e-mail: sem espaços nas pontas e sempre minúsculo.
// "Ana@Empresa.com" e "ana@empresa.com " são a mesma conta (o banco também exige minúsculas).
export function normalizarEmail(valor: unknown): unknown {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : valor;
}

export function aparar(valor: unknown): unknown {
  return typeof valor === 'string' ? valor.trim() : valor;
}
