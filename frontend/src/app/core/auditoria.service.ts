import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API } from './auth.service';
import { Pagina } from './modelos';

export interface RegistroAuditoria {
  id: number;
  criadoEm: string;
  atorId: number | null;
  atorNome: string | null;
  acao: string;
  entidade: string;
  entidadeId: number | null;
  detalhes: Record<string, unknown> | null;
}

// Texto de cada ação, em português, para a tela
export const ROTULOS_ACAO: Record<string, string> = {
  USUARIO_CRIADO: 'Conta criada',
  PAPEL_ALTERADO: 'Perfil de acesso alterado',
  CONTA_DESATIVADA: 'Conta desativada',
  CONTA_REATIVADA: 'Conta reativada',
  CONTA_ANONIMIZADA: 'Conta anonimizada (LGPD)',
  EQUIPAMENTO_CRIADO: 'Equipamento cadastrado',
  EQUIPAMENTO_EDITADO: 'Equipamento editado',
  EQUIPAMENTO_DESATIVADO: 'Equipamento desativado',
  EQUIPAMENTO_REATIVADO: 'Equipamento reativado',
  DEVOLUCAO_POR_ADMIN: 'Devolução feita por administrador',
  SENHA_ALTERADA: 'Senha alterada',
  SENHA_REDEFINIDA_POR_EMAIL: 'Senha redefinida pelo e-mail',
  EMAIL_ALTERADO: 'E-mail alterado',
  SESSAO_REUTILIZADA: 'Sessão suspeita (possível roubo de acesso)',
};

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly http = inject(HttpClient);

  listar(acao: string, pagina: number) {
    let params = new HttpParams().set('pagina', pagina).set('limite', 15);
    if (acao) params = params.set('acao', acao);
    return this.http.get<Pagina<RegistroAuditoria>>(`${API}/auditoria`, { params });
  }
}
