import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API } from './auth.service';
import { Pagina, Role, Usuario } from './modelos';

export interface FiltroUsuarios {
  role: Role | '';
  ativo: '' | 'true' | 'false';
  pagina: number;
}

// Gestão de contas (só ADMIN)
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroUsuarios) {
    let params = new HttpParams().set('pagina', filtro.pagina).set('limite', 10);
    if (filtro.role) params = params.set('role', filtro.role);
    if (filtro.ativo) params = params.set('ativo', filtro.ativo);
    return this.http.get<Pagina<Usuario>>(`${API}/usuarios`, { params });
  }

  criar(dados: { nome: string; email: string; senha: string; role: Role }) {
    return this.http.post<Usuario>(`${API}/usuarios`, dados);
  }

  atualizar(id: number, dados: { role?: Role; ativo?: boolean }) {
    return this.http.patch<Usuario>(`${API}/usuarios/${id}`, dados);
  }
}
