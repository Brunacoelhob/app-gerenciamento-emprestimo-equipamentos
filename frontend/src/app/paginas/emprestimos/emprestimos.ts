import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BuscaComAtraso } from '../../compartilhado/busca-com-atraso';
import { IdCurto } from '../../compartilhado/id-curto';
import { Telefone } from '../../compartilhado/telefone';
import { Alertas } from '../../compartilhado/alertas';
import { MenuExportar } from '../../compartilhado/menu-exportar';
import { Paginacao } from '../../compartilhado/paginacao';
import { FORMATOS_RELATORIO, RelatorioService } from '../../core/relatorio.service';
import { EmprestimosService, SituacaoEmprestimo } from '../../core/emprestimos.service';
import { mensagemDeErro } from '../../core/erro';
import { Emprestimo, Pagina } from '../../core/modelos';

@Component({
  selector: 'app-emprestimos',
  imports: [MenuExportar, Telefone, FormsModule, DatePipe, Paginacao, IdCurto],
  templateUrl: './emprestimos.html',
})
export class Emprestimos implements OnInit {
  private readonly servico = inject(EmprestimosService);
  private readonly alertas = inject(Alertas);
  private readonly relatorio = inject(RelatorioService);
  protected readonly formatos = FORMATOS_RELATORIO;
  protected readonly exportando = signal(false);

  // Rota "emprestimos" (ADMIN) mostra todos; "meus-emprestimos" mostra só os da própria pessoa.
  protected readonly todos = inject(ActivatedRoute).snapshot.data['todos'] === true;

  protected readonly dados = signal<Pagina<Emprestimo> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly devolvendo = signal<number | null>(null);
  protected readonly renovando = signal<number | null>(null);

  protected situacao: SituacaoEmprestimo = 'todos';
  protected busca = '';
  private readonly atraso = new BuscaComAtraso();

  // Para o administrador a busca também olha o nome e o e-mail da pessoa
  protected get dicaDaBusca() {
    return this.todos ? 'Buscar por equipamento ou pessoa' : 'Buscar por equipamento';
  }

  ngOnInit() {
    this.carregar(1);
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.servico.listar(this.todos, this.situacao, pagina, 10, this.busca).subscribe({
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
    this.atraso.agendar(() => this.filtrar());
  }

  protected filtrar() {
    this.atraso.cancelar();
    this.erro.set(null);
    this.carregar(1);
  }

  protected exportar(formato: string) {
    this.exportando.set(true);
    const caminho = this.todos ? 'emprestimos/relatorio' : 'emprestimos/meus/relatorio';
    const situacao = this.situacao;
    const filtros = {
      busca: this.busca,
      status:
        situacao === 'ativos' || situacao === 'atrasados'
          ? 'ATIVO'
          : situacao === 'devolvidos'
            ? 'DEVOLVIDO'
            : undefined,
      atrasados: situacao === 'atrasados' ? 'true' : undefined,
    };
    this.relatorio.baixar(caminho, formato as 'pdf' | 'xlsx' | 'csv', filtros).subscribe({
      next: (r) => {
        this.relatorio.salvar(r);
        this.exportando.set(false);
        if (r.cortado)
          this.alertas.aviso(
            `O filtro tem ${r.total} empréstimos: o arquivo traz só os 5000 mais recentes.`,
          );
        else
          this.alertas.sucesso(
            `Relatório gerado (${r.total} ${r.total === 1 ? 'empréstimo' : 'empréstimos'}).`,
          );
      },
      error: (e: unknown) => {
        this.exportando.set(false);
        void this.alertas.erro(mensagemDeErro(e), 'Não foi possível gerar o relatório');
      },
    });
  }

  protected async renovar(e: Emprestimo) {
    const restantes = 2 - e.renovacoes;
    const confirmou = await this.alertas.confirmar({
      titulo: `Renovar "${e.equipamento.nome}"?`,
      texto: `O prazo ganha mais 7 dias. Depois desta, ${restantes - 1 === 0 ? 'não haverá mais renovações' : 'ainda poderá renovar mais 1 vez'}.`,
      confirmar: 'Renovar por 7 dias',
    });
    if (!confirmou) return;

    this.renovando.set(e.id);
    this.servico.renovar(e.id).subscribe({
      next: (r) => {
        this.renovando.set(null);
        this.alertas.sucesso(`Prazo de "${e.equipamento.nome}" renovado até ${new Date(r.prazoDevolucao).toLocaleDateString('pt-BR')}.`);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (err: unknown) => {
        this.renovando.set(null);
        void this.alertas.erro(mensagemDeErro(err), 'Não foi possível renovar');
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
    });
  }

  protected async devolver(e: Emprestimo) {
    const confirmou = await this.alertas.confirmar({
      titulo: `Devolver "${e.equipamento.nome}"?`,
      texto: 'O equipamento volta a ficar disponível para outras pessoas.',
      confirmar: 'Devolver',
    });
    if (!confirmou) return;

    this.devolvendo.set(e.id);
    this.erro.set(null);
    this.servico.devolver(e.id).subscribe({
      next: () => {
        this.devolvendo.set(null);
        this.alertas.sucesso(`"${e.equipamento.nome}" devolvido.`);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (err: unknown) => {
        this.devolvendo.set(null);
        void this.alertas.erro(mensagemDeErro(err));
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
    });
  }
}
