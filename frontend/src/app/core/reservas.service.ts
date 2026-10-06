import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API } from './auth.service';
import { Reserva } from './modelos';

@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);

  entrar(equipamentoId: number) {
    return this.http.post<Reserva>(`${API}/reservas`, { equipamentoId });
  }

  minhas() {
    return this.http.get<Reserva[]>(`${API}/reservas/minhas`);
  }

  sair(id: number) {
    return this.http.delete<void>(`${API}/reservas/${id}`);
  }
}
