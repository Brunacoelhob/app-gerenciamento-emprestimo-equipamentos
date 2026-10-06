import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Alertas } from '../../compartilhado/alertas';
import { BuscaComAtraso } from '../../compartilhado/busca-com-atraso';
import { Icone } from '../../compartilhado/icone';
import { ItemDoMenu, MenuExportar } from '../../compartilhado/menu-exportar';
import { Paginacao } from '../../compartilhado/paginacao';
import {
  AuditoriaService,
  CategoriaAuditoria,
  FormatoRelatorio,
  InfoAcao,
  RegistroAuditoria,
  ROTULOS_CATEGORIA,
} from '../../core/auditoria.service';
import { mensagemDeErro } from '../../core/erro';
import { Pagina } from '../../core/modelos';

const ICONES: Record<CategoriaAuditoria, string> = {
  conta: 'pessoa',
  acervo: 'notebook',
  emprestimo: 'troca',
  seguranca: 'escudo',
};

const FORMATOS: ItemDoMenu<FormatoRelatorio>[] = [
  { valor: 'pdf', rotulo: 'PDF', detalhe: 'Para ler e imprimir' },
  { valor: 'xlsx', rotulo: 'Excel (.xlsx)', detalhe: 'Planilha com filtros' },
  { valor: 'csv', rotulo: 'CSV', detalhe: 'Para importar em outros sistemas' },
];

@Component({
  selector: 'app-auditoria',
  imports: [FormsModule, DatePipe, Paginacao, Icone, MenuExportar],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.scss',
})
export class Auditoria implements OnInit {
  private readonly servico = inject(AuditoriaService);
  private readonly alertas = inject(Alertas);

  protected readonly formatos = FORMATOS;
  protected readonly acoes = signal<InfoAcao[]>([]);
  // O filtro de ações agrupado por categoria (Contas, Acervo, Empréstimos, Segurança)
  protected readonly grupos = computed(() =>
    (Object.keys(ROTULOS_CATEGORIA) as CategoriaAuditoria[])
      .map((categoria) => ({
        rotulo: ROTULOS_CATEGORIA[categoria],
        itens: this.acoes().filter((a) => a.categoria === categoria),
      }))
      .filter((g) => g.itens.length > 0),
  );

  protected acao = '';
  protected busca = '';
  private readonly atraso = new BuscaComAtraso();

  protected readonly dados = signal<Pagina<RegistroAuditoria> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly exportando = signal(false);
  protected readonly erro = signal<string | null>(null);

  ngOnInit() {
    this.servico.acoes().subscribe({ next: (a) => this.acoes.set(a), error: () => undefined });
    this.carregar(1);
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listar(this.acao, pagina, this.busca).subscribe({
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

  protected agendarBusca() {
    this.atraso.agendar(() => this.carregar(1));
  }

  protected inicial(nome: string | null): string {
    return (nome ?? 'S').trim().charAt(0).toUpperCase();
  }

  protected icone(categoria: CategoriaAuditoria) {
    return ICONES[categoria];
  }

  protected exportar(formato: string) {
    this.exportando.set(true);
    this.servico.baixarRelatorio(formato as FormatoRelatorio, this.acao, this.busca).subscribe({
      next: ({ arquivo, nome, total, cortado }) => {
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = nome;
        link.click();
        URL.revokeObjectURL(url);
        this.exportando.set(false);
        if (cortado)
          this.alertas.aviso(
            `O filtro tem ${total} registros: o arquivo traz só os 5000 mais recentes. Refine o filtro para ver o resto.`,
          );
        else
          this.alertas.sucesso(
            `Relatório gerado (${total} ${total === 1 ? 'registro' : 'registros'}).`,
          );
        this.carregar(this.dados()?.meta.pagina ?? 1); // a própria exportação entra na trilha
      },
      error: (e: unknown) => {
        this.exportando.set(false);
        void this.alertas.erro(mensagemDeErro(e), 'Não foi possível gerar o relatório');
      },
    });
  }
}
