import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { API } from './auth.service';
import { Emprestimo, Pagina } from './modelos';

export type SituacaoEmprestimo = 'todos' | 'ativos' | 'atrasados' | 'devolvidos';

@Injectable({ providedIn: 'root' })
export class EmprestimosService {
  private readonly http = inject(HttpClient);

  // `todos = true` usa a listagem geral (só ADMIN); senão, só os empréstimos da própria pessoa.
  listar(todos: boolean, situacao: SituacaoEmprestimo, pagina: number, limite = 10, busca = '') {
    let params = new HttpParams().set('pagina', pagina).set('limite', limite);
    if (situacao === 'ativos') params = params.set('status', 'ATIVO');
    if (situacao === 'atrasados') params = params.set('atrasados', true);
    if (situacao === 'devolvidos') params = params.set('status', 'DEVOLVIDO');
    if (busca.trim()) params = params.set('busca', busca.trim());
    return this.http.get<Pagina<Emprestimo>>(`${API}/emprestimos${todos ? '' : '/meus'}`, {
      params,
    });
  }

  // Só o total (para o painel): pede 1 item e lê os metadados.
  contar(todos: boolean, situacao: SituacaoEmprestimo) {
    return this.listar(todos, situacao, 1, 1).pipe(map((p) => p.meta.total));
  }

  emprestar(equipamentoId: number, dias: number) {
    return this.http.post<Emprestimo>(`${API}/emprestimos`, { equipamentoId, dias });
  }

  renovar(id: number, dias = 7) {
    return this.http.patch<Emprestimo>(`${API}/emprestimos/${id}/renovacao`, { dias });
  }

  devolver(id: number) {
    return this.http.patch<Emprestimo>(`${API}/emprestimos/${id}/devolucao`, {});
  }
}
