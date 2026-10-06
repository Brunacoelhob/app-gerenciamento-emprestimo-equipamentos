import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ItemDoMenu } from '../compartilhado/menu-exportar';
import { FormatoRelatorio, RelatorioBaixado } from './auditoria.service';

export const FORMATOS_RELATORIO: ItemDoMenu<FormatoRelatorio>[] = [
  { valor: 'pdf', rotulo: 'PDF', detalhe: 'Para ler e imprimir' },
  { valor: 'xlsx', rotulo: 'Excel (.xlsx)', detalhe: 'Planilha com filtros' },
  { valor: 'csv', rotulo: 'CSV', detalhe: 'Para importar em outros sistemas' },
];

// Baixa o relatório de uma listagem (empréstimos, equipamentos...) com os mesmos filtros da tela
@Injectable({ providedIn: 'root' })
export class RelatorioService {
  private readonly http = inject(HttpClient);

  baixar(caminho: string, formato: FormatoRelatorio, filtros: Record<string, string | undefined>) {
    let params = new HttpParams().set('formato', formato);
    for (const [chave, valor] of Object.entries(filtros)) {
      if (valor && valor.trim()) params = params.set(chave, valor.trim());
    }
    return this.http
      .get(`/api/v1/${caminho}`, { params, observe: 'response', responseType: 'blob' })
      .pipe(
        map((r): RelatorioBaixado => {
          const disposicao = r.headers.get('Content-Disposition') ?? '';
          return {
            arquivo: r.body as Blob,
            nome: /filename="([^"]+)"/.exec(disposicao)?.[1] ?? `relatorio.${formato}`,
            total: Number(r.headers.get('X-Total-Registros') ?? 0),
            cortado: r.headers.get('X-Relatorio-Cortado') === 'true',
          };
        }),
      );
  }

  /** Entrega o arquivo ao navegador (abre o "salvar como"). */
  salvar({ arquivo, nome }: RelatorioBaixado) {
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
  }
}
