import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { EmprestimosService } from '../../core/emprestimos.service';
import { EquipamentosService } from '../../core/equipamentos.service';
import { mensagemDeErro } from '../../core/erro';
import { Emprestimo } from '../../core/modelos';

interface Indicadores {
  disponiveis: number;
  emprestados: number;
  meusAtivos: number;
  meusAtrasados: number;
  todosAtivos: number | null; // só para ADMIN
  todosAtrasados: number | null; // só para ADMIN
}

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, DatePipe],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
})
export class Inicio implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly equipamentos = inject(EquipamentosService);
  private readonly emprestimos = inject(EmprestimosService);

  protected readonly indicadores = signal<Indicadores | null>(null);
  protected readonly pendentes = signal<Emprestimo[]>([]);
  protected readonly erro = signal<string | null>(null);

  ngOnInit() {
    const admin = this.auth.ehAdmin();
    forkJoin({
      disponiveis: this.equipamentos.contar('disponivel'),
      emprestados: this.equipamentos.contar('emprestado'),
      meusAtivos: this.emprestimos.contar(false, 'ativos'),
      meusAtrasados: this.emprestimos.contar(false, 'atrasados'),
      todosAtivos: admin ? this.emprestimos.contar(true, 'ativos') : of(null),
      todosAtrasados: admin ? this.emprestimos.contar(true, 'atrasados') : of(null),
      pendentes: this.emprestimos.listar(false, 'ativos', 1, 5),
    }).subscribe({
      next: ({ pendentes, ...numeros }) => {
        this.indicadores.set(numeros);
        this.pendentes.set(pendentes.itens);
      },
      error: (e: unknown) => this.erro.set(mensagemDeErro(e)),
    });
  }
}
