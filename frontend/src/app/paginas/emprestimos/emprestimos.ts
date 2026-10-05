import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Paginacao } from '../../compartilhado/paginacao';
import { EmprestimosService, SituacaoEmprestimo } from '../../core/emprestimos.service';
import { mensagemDeErro } from '../../core/erro';
import { Emprestimo, Pagina } from '../../core/modelos';

@Component({
  selector: 'app-emprestimos',
  imports: [FormsModule, DatePipe, Paginacao],
  templateUrl: './emprestimos.html',
})
export class Emprestimos implements OnInit {
  private readonly servico = inject(EmprestimosService);

  // Rota "emprestimos" (ADMIN) mostra todos; "meus-emprestimos" mostra só os da própria pessoa.
  protected readonly todos = inject(ActivatedRoute).snapshot.data['todos'] === true;

  protected readonly dados = signal<Pagina<Emprestimo> | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly devolvendo = signal<number | null>(null);

  protected situacao: SituacaoEmprestimo = 'todos';

  ngOnInit() {
    this.carregar(1);
  }

  protected carregar(pagina: number) {
    this.carregando.set(true);
    this.servico.listar(this.todos, this.situacao, pagina).subscribe({
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
    this.erro.set(null);
    this.carregar(1);
  }

  protected devolver(e: Emprestimo) {
    this.devolvendo.set(e.id);
    this.erro.set(null);
    this.aviso.set(null);
    this.servico.devolver(e.id).subscribe({
      next: () => {
        this.devolvendo.set(null);
        this.aviso.set(`"${e.equipamento.nome}" devolvido.`);
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
      error: (err: unknown) => {
        this.devolvendo.set(null);
        this.erro.set(mensagemDeErro(err));
        this.carregar(this.dados()?.meta.pagina ?? 1);
      },
    });
  }
}
