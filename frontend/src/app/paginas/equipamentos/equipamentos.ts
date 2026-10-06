import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Modal } from '../../compartilhado/modal';
import { QrEquipamento } from '../../compartilhado/qr-equipamento';
import { ErroCampo } from '../../compartilhado/erro-campo';
import { BuscaComAtraso } from '../../compartilhado/busca-com-atraso';
import { IdCurto } from '../../compartilhado/id-curto';
import { Alertas } from '../../compartilhado/alertas';
import { MenuExportar } from '../../compartilhado/menu-exportar';
import { Paginacao } from '../../compartilhado/paginacao';
import { FORMATOS_RELATORIO, RelatorioService } from '../../core/relatorio.service';
import { AuthService } from '../../core/auth.service';
import { EmprestimosService } from '../../core/emprestimos.service';
import { ReservasService } from '../../core/reservas.service';
import { EquipamentosService, SituacaoFiltro } from '../../core/equipamentos.service';
import { mensagemDeErro } from '../../core/erro';
import { Equipamento, Pagina, Reserva } from '../../core/modelos';

type Painel =
  | { tipo: 'novo' }
  | { tipo: 'editar'; equipamento: Equipamento }
  | { tipo: 'emprestar'; equipamento: Equipamento };

@Component({
  selector: 'app-equipamentos',
  imports: [Modal, QrEquipamento, MenuExportar, ErroCampo, ReactiveFormsModule, FormsModule, Paginacao, IdCurto],
  templateUrl: './equipamentos.html',
})
export class Equipamentos implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly servico = inject(EquipamentosService);
  private readonly emprestimos = inject(EmprestimosService);
  private readonly alertas = inject(Alertas);
  private readonly reservas = inject(ReservasService);
  private readonly rota = inject(ActivatedRoute);
  protected readonly qrDe = signal<Equipamento | null>(null);
  protected readonly minhasFilas = signal<Reserva[]>([]);
  private readonly relatorio = inject(RelatorioService);
  protected readonly formatos = FORMATOS_RELATORIO;
  protected readonly exportando = signal(false);

  protected readonly dados = signal<Pagina<Equipamento> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly painel = signal<Painel | null>(null);
  protected readonly salvando = signal(false);

  protected busca = '';
  private readonly atraso = new BuscaComAtraso();
  protected situacao: SituacaoFiltro = 'todos';
  protected dias = 7;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.maxLength(120)]],
    descricao: ['', [Validators.maxLength(500)]],
  });

  ngOnInit() {
    // Vindo do QR code da etiqueta: já abre filtrado pelo código do equipamento
    this.busca = this.rota.snapshot.queryParamMap.get('busca') ?? '';
    this.carregar(1);
    this.carregarFilas();
  }

  protected imprimirEtiqueta() {
    window.print();
  }

  protected carregarFilas() {
    this.reservas.minhas().subscribe({ next: (r) => this.minhasFilas.set(r), error: () => undefined });
  }

  protected naFila(equipamentoId: number) {
    return this.minhasFilas().some((r) => r.equipamento.id === equipamentoId);
  }

  protected entrarNaFila(e: Equipamento) {
    this.reservas.entrar(e.id).subscribe({
      next: (r) => {
        this.alertas.sucesso(`Você entrou na fila de "${e.nome}" (posição ${r.posicao}). Avisaremos por e-mail.`);
        this.carregarFilas();
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (err: unknown) => void this.alertas.erro(mensagemDeErro(err), 'Não foi possível entrar na fila'),
    });
  }

  protected async sairDaFila(r: Reserva) {
    const confirmou = await this.alertas.confirmar({
      titulo: `Sair da fila de "${r.equipamento.nome}"?`,
      texto: 'Você perde o seu lugar e não será avisado quando ele for devolvido.',
      confirmar: 'Sair da fila',
      perigo: true,
    });
    if (!confirmou) return;
    this.reservas.sair(r.id).subscribe({
      next: () => {
        this.alertas.sucesso('Você saiu da fila.');
        this.carregarFilas();
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (err: unknown) => void this.alertas.erro(mensagemDeErro(err)),
    });
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listar({ busca: this.busca, situacao: this.situacao, pagina }).subscribe({
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
    this.carregar(1);
  }

  protected abrirNovo() {
    this.form.reset({ nome: '', descricao: '' });
    this.painel.set({ tipo: 'novo' });
  }

  protected abrirEdicao(equipamento: Equipamento) {
    this.form.reset({ nome: equipamento.nome, descricao: equipamento.descricao ?? '' });
    this.painel.set({ tipo: 'editar', equipamento });
  }

  protected abrirEmprestimo(equipamento: Equipamento) {
    this.dias = 7;
    this.painel.set({ tipo: 'emprestar', equipamento });
  }

  protected fechar() {
    this.painel.set(null);
  }

  protected salvar() {
    const painel = this.painel();
    if (!painel || painel.tipo === 'emprestar') return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nome, descricao } = this.form.getRawValue();
    const dados = { nome, descricao };
    const chamada =
      painel.tipo === 'novo'
        ? this.servico.criar(dados)
        : this.servico.atualizar(painel.equipamento.id, dados);

    this.executar(
      chamada,
      painel.tipo === 'novo' ? 'Equipamento cadastrado.' : 'Equipamento atualizado.',
    );
  }

  protected exportar(formato: string) {
    this.exportando.set(true);
    const filtros = {
      busca: this.busca,
      ativo:
        this.situacao === 'inativo' ? 'false' : this.situacao === 'disponivel' ? 'true' : undefined,
      emprestado:
        this.situacao === 'emprestado'
          ? 'true'
          : this.situacao === 'disponivel'
            ? 'false'
            : undefined,
    };
    this.relatorio
      .baixar('equipamentos/relatorio', formato as 'pdf' | 'xlsx' | 'csv', filtros)
      .subscribe({
        next: (r) => {
          this.relatorio.salvar(r);
          this.exportando.set(false);
          this.alertas.sucesso(
            `Relatório gerado (${r.total} ${r.total === 1 ? 'equipamento' : 'equipamentos'}).`,
          );
        },
        error: (e: unknown) => {
          this.exportando.set(false);
          void this.alertas.erro(mensagemDeErro(e), 'Não foi possível gerar o relatório');
        },
      });
  }

  protected async alternarAtivo(e: Equipamento) {
    // Desativar tira o equipamento de circulação: pede confirmação (reativar não precisa)
    if (
      e.ativo &&
      !(await this.alertas.confirmar({
        titulo: `Desativar "${e.nome}"?`,
        texto:
          'Ninguém poderá pegar este equipamento emprestado enquanto ele estiver desativado. Você pode reativá-lo depois.',
        confirmar: 'Desativar',
        perigo: true,
      }))
    ) {
      return;
    }
    this.executar(
      this.servico.atualizar(e.id, { ativo: !e.ativo }),
      e.ativo ? 'Equipamento desativado.' : 'Equipamento reativado.',
    );
  }

  protected confirmarEmprestimo() {
    const painel = this.painel();
    if (painel?.tipo !== 'emprestar') return;
    const dias = Math.trunc(Number(this.dias));
    if (!(dias >= 1 && dias <= 30)) {
      this.erro.set('O prazo deve ser de 1 a 30 dias.');
      return;
    }
    this.executar(
      this.emprestimos.emprestar(painel.equipamento.id, dias),
      `"${painel.equipamento.nome}" emprestado por ${dias} dia(s).`,
    );
  }

  private executar(
    chamada: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => unknown },
    sucesso: string,
  ) {
    this.salvando.set(true);
    this.erro.set(null);
    chamada.subscribe({
      next: () => {
        this.salvando.set(false);
        this.painel.set(null);
        this.alertas.sucesso(sucesso);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        // Erro de cadastro/edição fica junto do formulário; falha ao desativar ou emprestar vira uma janela
        const formulario = this.painel()?.tipo === 'novo' || this.painel()?.tipo === 'editar';
        if (formulario) this.erro.set(mensagemDeErro(e));
        else void this.alertas.erro(mensagemDeErro(e));
        // O equipamento pode ter sido emprestado por outra pessoa: atualiza a lista
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
    });
  }
}
