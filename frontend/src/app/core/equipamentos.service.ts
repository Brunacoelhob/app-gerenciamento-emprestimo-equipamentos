import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { API } from './auth.service';
import { Equipamento, Pagina } from './modelos';

export type SituacaoFiltro = 'todos' | 'disponivel' | 'emprestado' | 'inativo';

export interface FiltroEquipamentos {
  busca: string;
  situacao: SituacaoFiltro;
  pagina: number;
}

@Injectable({ providedIn: 'root' })
export class EquipamentosService {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroEquipamentos, limite = 10) {
    let params = new HttpParams().set('pagina', filtro.pagina).set('limite', limite);
    if (filtro.busca.trim()) params = params.set('busca', filtro.busca.trim());
    if (filtro.situacao === 'disponivel')
      params = params.set('ativo', true).set('emprestado', false);
    if (filtro.situacao === 'emprestado') params = params.set('emprestado', true);
    if (filtro.situacao === 'inativo') params = params.set('ativo', false);
    return this.http.get<Pagina<Equipamento>>(`${API}/equipamentos`, { params });
  }

  // Só o total (para o painel): pede 1 item e lê os metadados.
  contar(situacao: SituacaoFiltro) {
    return this.listar({ busca: '', situacao, pagina: 1 }, 1).pipe(map((p) => p.meta.total));
  }

  criar(dados: { nome: string; descricao?: string }) {
    return this.http.post<Equipamento>(`${API}/equipamentos`, dados);
  }

  atualizar(id: number, dados: { nome?: string; descricao?: string; ativo?: boolean }) {
    return this.http.patch<Equipamento>(`${API}/equipamentos/${id}`, dados);
  }

  /** Endereço da foto (pública, pelo código aleatório). A versão na URL faz o navegador buscar de novo ao trocar a foto. */
  fotoUrl(e: Pick<Equipamento, 'codigo' | 'fotoVersao'>): string | null {
    return e.fotoVersao ? `${API}/equipamentos/foto/${e.codigo}?v=${e.fotoVersao}` : null;
  }

  enviarFoto(id: number, foto: Blob) {
    return this.http.put<Equipamento>(`${API}/equipamentos/${id}/foto`, foto, {
      headers: { 'Content-Type': foto.type },
    });
  }

  removerFoto(id: number) {
    return this.http.delete<Equipamento>(`${API}/equipamentos/${id}/foto`);
  }
}
