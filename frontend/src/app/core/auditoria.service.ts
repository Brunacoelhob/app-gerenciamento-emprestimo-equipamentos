import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { API } from './auth.service';
import { Pagina } from './modelos';

export type CategoriaAuditoria = 'conta' | 'acervo' | 'emprestimo' | 'seguranca';
export type FormatoRelatorio = 'pdf' | 'xlsx' | 'csv';

export interface ItemDescricao {
  rotulo: string;
  valor: string;
}

// Já vem da API com os textos prontos (a tela e os relatórios usam as mesmas palavras)
export interface RegistroAuditoria {
  id: number;
  criadoEm: string;
  atorId: number | null;
  atorNome: string | null;
  acao: string;
  acaoRotulo: string;
  categoria: CategoriaAuditoria;
  critica: boolean;
  entidade: string;
  entidadeRotulo: string;
  entidadeId: number | null;
  descricao: ItemDescricao[];
}

export interface InfoAcao {
  valor: string;
  rotulo: string;
  categoria: CategoriaAuditoria;
  critica: boolean;
}

export const ROTULOS_CATEGORIA: Record<CategoriaAuditoria, string> = {
  conta: 'Contas e acessos',
  acervo: 'Acervo',
  emprestimo: 'Empréstimos',
  seguranca: 'Segurança',
};

export interface RelatorioBaixado {
  arquivo: Blob;
  nome: string;
  total: number;
  cortado: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly http = inject(HttpClient);

  listar(acao: string, pagina: number, busca = '') {
    return this.http.get<Pagina<RegistroAuditoria>>(`${API}/auditoria`, {
      params: this.filtros(acao, busca).set('pagina', pagina).set('limite', 15),
    });
  }

  acoes() {
    return this.http.get<InfoAcao[]>(`${API}/auditoria/acoes`);
  }

  // O relatório respeita os mesmos filtros da tela, mas traz TODOS os registros (não só a página que está aberta)
  baixarRelatorio(formato: FormatoRelatorio, acao: string, busca = '') {
    return this.http
      .get(`${API}/auditoria/relatorio`, {
        params: this.filtros(acao, busca).set('formato', formato),
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((r): RelatorioBaixado => {
          const disposicao = r.headers.get('Content-Disposition') ?? '';
          return {
            arquivo: r.body as Blob,
            nome: /filename="([^"]+)"/.exec(disposicao)?.[1] ?? `auditoria.${formato}`,
            total: Number(r.headers.get('X-Total-Registros') ?? 0),
            cortado: r.headers.get('X-Relatorio-Cortado') === 'true',
          };
        }),
      );
  }

  private filtros(acao: string, busca: string) {
    let params = new HttpParams();
    if (acao) params = params.set('acao', acao);
    if (busca.trim()) params = params.set('busca', busca.trim());
    return params;
  }
}
