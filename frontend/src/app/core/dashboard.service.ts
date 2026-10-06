import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API } from './auth.service';
import { Dashboard } from './modelos';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  resumo(dias: number) {
    return this.http.get<Dashboard>(`${API}/dashboard/resumo`, {
      params: new HttpParams().set('dias', dias),
    });
  }
}
