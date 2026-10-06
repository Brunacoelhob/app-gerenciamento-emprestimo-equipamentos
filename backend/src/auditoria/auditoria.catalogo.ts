// Como cada ação da trilha é apresentada: texto em português, categoria (para agrupar e colorir) e se é crítica
// (merece atenção). É a ÚNICA fonte desses textos: a tela e os relatórios usam as mesmas palavras.

export type CategoriaAuditoria = 'conta' | 'acervo' | 'emprestimo' | 'seguranca';

export interface InfoAcao {
  rotulo: string;
  categoria: CategoriaAuditoria;
  /** Ações que indicam risco ou mudança grave: a tela as destaca. */
  critica: boolean;
}

export const CATALOGO_ACOES = {
  USUARIO_CRIADO: { rotulo: 'Conta criada', categoria: 'conta', critica: false },
  PAPEL_ALTERADO: { rotulo: 'Perfil de acesso alterado', categoria: 'conta', critica: true },
  CONTA_DESATIVADA: { rotulo: 'Conta desativada', categoria: 'conta', critica: true },
  CONTA_REATIVADA: { rotulo: 'Conta reativada', categoria: 'conta', critica: false },
  CONTA_ANONIMIZADA: { rotulo: 'Conta excluída (anonimizada)', categoria: 'conta', critica: true },
  EMAIL_ALTERADO: { rotulo: 'E-mail alterado', categoria: 'conta', critica: false },
  EQUIPAMENTO_CRIADO: { rotulo: 'Equipamento cadastrado', categoria: 'acervo', critica: false },
  EQUIPAMENTO_EDITADO: { rotulo: 'Equipamento editado', categoria: 'acervo', critica: false },
  EQUIPAMENTO_DESATIVADO: { rotulo: 'Equipamento desativado', categoria: 'acervo', critica: false },
  EQUIPAMENTO_REATIVADO: { rotulo: 'Equipamento reativado', categoria: 'acervo', critica: false },
  DEVOLUCAO_POR_ADMIN: { rotulo: 'Devolução feita por administrador', categoria: 'emprestimo', critica: false },
  EMPRESTIMO_RENOVADO: { rotulo: 'Prazo renovado', categoria: 'emprestimo', critica: false },
  SENHA_ALTERADA: { rotulo: 'Senha alterada', categoria: 'seguranca', critica: false },
  SENHA_REDEFINIDA_POR_EMAIL: { rotulo: 'Senha redefinida pelo e-mail', categoria: 'seguranca', critica: false },
  SESSAO_REUTILIZADA: { rotulo: 'Sessão suspeita (possível roubo de acesso)', categoria: 'seguranca', critica: true },
  AUDITORIA_EXPORTADA: { rotulo: 'Relatório de auditoria exportado', categoria: 'seguranca', critica: false },
} as const satisfies Record<string, InfoAcao>;

export type AcaoAuditoria = keyof typeof CATALOGO_ACOES;

export function infoDaAcao(acao: string): InfoAcao {
  return (CATALOGO_ACOES as Record<string, InfoAcao>)[acao] ?? { rotulo: acao, categoria: 'conta', critica: false };
}

const ENTIDADES: Record<string, string> = {
  usuario: 'Usuário',
  equipamento: 'Equipamento',
  emprestimo: 'Empréstimo',
  auditoria: 'Auditoria',
};

export const rotuloDaEntidade = (entidade: string) => ENTIDADES[entidade] ?? entidade;

export interface ItemDescricao {
  rotulo: string;
  valor: string;
}

const PAPEIS: Record<string, string> = { ADMIN: 'Administrador', USER: 'Usuário' };

// Valor desconhecido (vem de JSON) em texto: objetos viram JSON, nunca "[object Object]"
const emTexto = (valor: unknown): string => {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') return String(valor);
  return JSON.stringify(valor);
};

/**
 * Transforma os detalhes guardados (JSON cru, como {"role":"ADMIN","ativo":false}) em pares legíveis
 * ("Perfil: Administrador"). Campos vazios somem. Chaves desconhecidas aparecem com o próprio nome, nunca são perdidas.
 */
export function descreverDetalhes(entidade: string, detalhes: unknown): ItemDescricao[] {
  if (!detalhes || typeof detalhes !== 'object' || Array.isArray(detalhes)) return [];
  const itens: ItemDescricao[] = [];
  for (const [chave, valor] of Object.entries(detalhes as Record<string, unknown>)) {
    if (valor === null || valor === undefined || valor === '') continue;
    switch (chave) {
      case 'nome':
        itens.push({ rotulo: 'Nome', valor: emTexto(valor) });
        break;
      case 'email':
        itens.push({ rotulo: 'E-mail', valor: emTexto(valor) });
        break;
      case 'role':
        itens.push({ rotulo: 'Perfil', valor: PAPEIS[emTexto(valor)] ?? emTexto(valor) });
        break;
      case 'ativo':
        itens.push(
          entidade === 'equipamento'
            ? { rotulo: 'Situação', valor: valor ? 'Em uso' : 'Desativado' }
            : { rotulo: 'Conta', valor: valor ? 'Ativa' : 'Desativada' },
        );
        break;
      case 'equipamento':
        itens.push({ rotulo: 'Equipamento', valor: emTexto(valor) });
        break;
      case 'pessoaId':
        itens.push({ rotulo: 'Pessoa nº', valor: emTexto(valor) });
        break;
      case 'novoPrazo': {
        const d = new Date(emTexto(valor));
        itens.push({
          rotulo: 'Novo prazo',
          valor: Number.isNaN(d.getTime())
            ? emTexto(valor)
            : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        });
        break;
      }
      case 'renovacoes':
        itens.push({ rotulo: 'Renovação nº', valor: emTexto(valor) });
        break;
      case 'formato':
        itens.push({ rotulo: 'Formato', valor: emTexto(valor).toUpperCase() });
        break;
      case 'linhas':
        itens.push({ rotulo: 'Registros', valor: emTexto(valor) });
        break;
      default:
        itens.push({ rotulo: chave, valor: emTexto(valor) });
    }
  }
  return itens;
}

/** Os mesmos detalhes numa linha só, para relatórios (PDF, Excel, CSV). */
export function detalhesEmTexto(entidade: string, detalhes: unknown): string {
  return descreverDetalhes(entidade, detalhes)
    .map((i) => `${i.rotulo}: ${i.valor}`)
    .join(' · ');
}
