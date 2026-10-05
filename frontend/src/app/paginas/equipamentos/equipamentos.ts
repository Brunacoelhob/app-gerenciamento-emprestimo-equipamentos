import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Paginacao } from '../../compartilhado/paginacao';
import { AuthService } from '../../core/auth.service';
import { EmprestimosService } from '../../core/emprestimos.service';
import { EquipamentosService, SituacaoFiltro } from '../../core/equipamentos.service';
import { mensagemDeErro } from '../../core/erro';
import { Equipamento, Pagina } from '../../core/modelos';

type Painel = { tipo: 'novo' } | { tipo: 'editar'; equipamento: Equipamento } | { tipo: 'emprestar'; equipamento: Equipamento };

@Component({
  selector: 'app-equipamentos',
  imports: [ReactiveFormsModule, FormsModule, Paginacao],
  templateUrl: './equipamentos.html',
})
export class Equipamentos implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly servico = inject(EquipamentosService);
  private readonly emprestimos = inject(EmprestimosService);

  protected readonly dados = signal<Pagina<Equipamento> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly painel = signal<Painel | null>(null);
  protected readonly salvando = signal(false);

  protected busca = '';
  protected situacao: SituacaoFiltro = 'todos';
  protected dias = 7;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.maxLength(120)]],
    descricao: ['', [Validators.maxLength(500)]],
  });

  ngOnInit() {
    this.carregar(1);
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

  protected filtrar() {
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
      painel.tipo === 'novo' ? this.servico.criar(dados) : this.servico.atualizar(painel.equipamento.id, dados);

    this.executar(chamada, painel.tipo === 'novo' ? 'Equipamento cadastrado.' : 'Equipamento atualizado.');
  }

  protected alternarAtivo(e: Equipamento) {
    this.executar(this.servico.atualizar(e.id, { ativo: !e.ativo }), e.ativo ? 'Equipamento desativado.' : 'Equipamento reativado.');
  }

  protected confirmarEmprestimo() {
    const painel = this.painel();
    if (painel?.tipo !== 'emprestar') return;
    const dias = Math.trunc(Number(this.dias));
    if (!(dias >= 1 && dias <= 30)) {
      this.erro.set('O prazo deve ser de 1 a 30 dias.');
      return;
    }
    this.executar(this.emprestimos.emprestar(painel.equipamento.id, dias), `"${painel.equipamento.nome}" emprestado por ${dias} dia(s).`);
  }

  private executar(chamada: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => unknown }, sucesso: string) {
    this.salvando.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    chamada.subscribe({
      next: () => {
        this.salvando.set(false);
        this.painel.set(null);
        this.aviso.set(sucesso);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erro.set(mensagemDeErro(e));
        // O equipamento pode ter sido emprestado por outra pessoa: atualiza a lista
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
    });
  }
}
