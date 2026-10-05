import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Paginacao } from '../../compartilhado/paginacao';
import { AuditoriaService, RegistroAuditoria, ROTULOS_ACAO } from '../../core/auditoria.service';
import { mensagemDeErro } from '../../core/erro';
import { Pagina } from '../../core/modelos';

@Component({
  selector: 'app-auditoria',
  imports: [FormsModule, DatePipe, Paginacao],
  templateUrl: './auditoria.html',
})
export class Auditoria implements OnInit {
  private readonly servico = inject(AuditoriaService);

  protected readonly acoes = Object.entries(ROTULOS_ACAO).map(([valor, rotulo]) => ({ valor, rotulo }));
  protected acao = '';

  protected readonly dados = signal<Pagina<RegistroAuditoria> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  ngOnInit() {
    this.carregar(1);
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listar(this.acao, pagina).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(mensagemDeErro(e));
        this.carregando.set(false);
      },
    });
  }

  protected rotulo(acao: string) {
    return ROTULOS_ACAO[acao] ?? acao;
  }

  protected suspeita(acao: string) {
    return acao === 'SESSAO_REUTILIZADA';
  }

  // "chave: valor" dos detalhes, sem mostrar o que não tem valor
  protected detalhes(r: RegistroAuditoria): string {
    return Object.entries(r.detalhes ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' · ');
  }
}
