// Limites de requisições. Os padrões são os de produção; as variáveis existem para testes de interface automatizados
// (que fazem dezenas de logins do mesmo IP) e para ajuste fino. NÃO aumente em produção sem necessidade: o limite do
// login é a principal defesa contra adivinhação de senhas.
export function lerLimite(nome: string, padrao: number, env: Record<string, string | undefined> = process.env): number {
  const bruto = env[nome]?.trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) {
    throw new Error(`Variável ${nome} inválida: use um número inteiro de 1 a 100000 (recebido "${bruto}").`);
  }
  return n;
}
