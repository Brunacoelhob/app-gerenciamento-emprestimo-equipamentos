import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GraficoBarras } from '../../compartilhado/graficos/grafico-barras';
import { GraficoLinhas, PontoLinha } from '../../compartilhado/graficos/grafico-linhas';
import { Fatia, GraficoRosca } from '../../compartilhado/graficos/grafico-rosca';
import { Icone } from '../../compartilhado/icone';
import { Modal } from '../../compartilhado/modal';
import { AuthService } from '../../core/auth.service';
import { DashboardService } from '../../core/dashboard.service';
import { EmprestimosService } from '../../core/emprestimos.service';
import { mensagemDeErro } from '../../core/erro';
import { Dashboard, Emprestimo } from '../../core/modelos';

type Tom = 'neutro' | 'ok' | 'aviso' | 'erro';

// Conteúdo de uma janela informativa: um card ou um gráfico explicado em linguagem simples.
interface Info {
  titulo: string;
  destaque?: string;
  blocos: { titulo: string; texto: string }[];
  link?: { rotulo: string; rota: string };
  atrasados?: boolean; // mostra a lista de atrasos dentro da janela
}

interface Card {
  id: string;
  rotulo: string;
  valor: string;
  tom: Tom;
  info: Info;
}

const PERIODOS = [7, 14, 30, 60, 90];

@Component({
  selector: 'app-inicio',
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    Icone,
    Modal,
    GraficoLinhas,
    GraficoRosca,
    GraficoBarras,
  ],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
})
export class Inicio implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly servico = inject(DashboardService);
  private readonly emprestimos = inject(EmprestimosService);

  protected readonly periodos = PERIODOS;
  protected periodo = 30;

  protected readonly dados = signal<Dashboard | null>(null);
  protected readonly pendentes = signal<Emprestimo[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly info = signal<Info | null>(null);
  protected readonly infoAberta = signal(false);

  ngOnInit() {
    this.carregar();
    this.emprestimos
      .listar(false, 'ativos', 1, 5)
      .subscribe({ next: (p) => this.pendentes.set(p.itens) });
  }

  protected carregar() {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.resumo(this.periodo).subscribe({
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

  protected abrir(info: Info) {
    this.info.set(info);
    this.infoAberta.set(true);
  }

  // ---- derivados dos dados ----

  private readonly geral = computed(() => this.dados()?.escopo === 'geral');

  protected readonly escopoTexto = computed(() =>
    this.geral() ? 'Panorama de todo o sistema' : 'Seus empréstimos e o estado do acervo',
  );

  protected readonly pontosSerie = computed<PontoLinha[]>(() =>
    (this.dados()?.serie ?? []).map((p) => ({
      rotulo: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}`,
      a: p.retiradas,
      b: p.devolucoes,
    })),
  );

  protected readonly fatiasAcervo = computed<Fatia[]>(() => {
    const k = this.dados()?.kpis;
    if (!k) return [];
    return [
      { rotulo: 'Disponíveis', valor: k.disponiveis, cor: 'var(--cor-disponivel)' },
      { rotulo: 'Emprestados', valor: k.emprestados, cor: 'var(--cor-emprestado)' },
      { rotulo: 'Desativados', valor: k.desativados, cor: 'var(--cor-desativado)' },
    ];
  });

  protected numero(valor: number | null, sufixo = ''): string {
    return valor === null ? '—' : `${valor.toLocaleString('pt-BR')}${sufixo}`;
  }

  protected readonly cards = computed<Card[]>(() => {
    const d = this.dados();
    if (!d) return [];
    const k = d.kpis;
    const geral = d.escopo === 'geral';
    const quem = geral ? 'no sistema todo' : 'nos seus empréstimos';
    const periodo = `nos últimos ${d.dias} dias`;

    return [
      {
        id: 'disponiveis',
        rotulo: 'Equipamentos disponíveis',
        valor: this.numero(k.disponiveis),
        tom: 'ok',
        info: {
          titulo: 'Equipamentos disponíveis',
          destaque: `${k.disponiveis} de ${k.equipamentosAtivos} equipamentos em uso`,
          blocos: [
            {
              titulo: 'O que significa',
              texto: 'São os equipamentos que ninguém está usando agora e que você pode retirar.',
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Total de equipamentos ativos menos os que têm um empréstimo em andamento. Equipamentos desativados (em manutenção, por exemplo) não entram na conta.',
            },
            {
              titulo: 'Para que serve',
              texto:
                'Se o número estiver baixo, a demanda está alta: vale conferir os atrasos para recuperar equipamentos parados com quem já passou do prazo.',
            },
          ],
          link: { rotulo: 'Ver equipamentos', rota: '/equipamentos' },
        },
      },
      {
        id: 'emprestados',
        rotulo: 'Equipamentos emprestados',
        valor: this.numero(k.emprestados),
        tom: 'aviso',
        info: {
          titulo: 'Equipamentos emprestados',
          destaque: `${k.emprestados} equipamentos com alguém agora`,
          blocos: [
            {
              titulo: 'O que significa',
              texto:
                'Equipamentos que estão com uma pessoa neste momento, dentro ou fora do prazo.',
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Equipamentos ativos que têm um empréstimo em andamento. Cada equipamento só pode estar com uma pessoa por vez: o banco de dados garante isso.',
            },
            {
              titulo: 'Para que serve',
              texto:
                'Mostra a taxa de uso do acervo. Compare com os disponíveis no gráfico "Situação do acervo".',
            },
          ],
          link: { rotulo: 'Ver equipamentos', rota: '/equipamentos' },
        },
      },
      {
        id: 'andamento',
        rotulo: geral ? 'Empréstimos em andamento' : 'Meus empréstimos em andamento',
        valor: this.numero(k.emprestimosAtivos),
        tom: 'neutro',
        info: {
          titulo: geral ? 'Empréstimos em andamento' : 'Meus empréstimos em andamento',
          destaque: `${k.emprestimosAtivos} ${quem}`,
          blocos: [
            {
              titulo: 'O que significa',
              texto: geral
                ? 'Quantos empréstimos ainda não foram devolvidos, somando todas as pessoas.'
                : 'Quantos equipamentos você retirou e ainda não devolveu.',
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Empréstimos com status "em andamento": o equipamento foi retirado e a devolução ainda não foi registrada.',
            },
            {
              titulo: 'Para que serve',
              texto: 'Ajuda a acompanhar o que está na rua e a lembrar das devoluções pendentes.',
            },
          ],
          link: {
            rotulo: geral ? 'Ver todos os empréstimos' : 'Ver meus empréstimos',
            rota: geral ? '/emprestimos' : '/meus-emprestimos',
          },
        },
      },
      {
        id: 'atrasados',
        rotulo: geral ? 'Empréstimos atrasados' : 'Meus atrasados',
        valor: this.numero(k.atrasados),
        tom: k.atrasados > 0 ? 'erro' : 'ok',
        info: {
          titulo: geral ? 'Empréstimos atrasados' : 'Meus empréstimos atrasados',
          destaque:
            k.atrasados === 0
              ? 'Nenhum atraso. Tudo em dia!'
              : `${k.atrasados} ${k.atrasados === 1 ? 'empréstimo passou' : 'empréstimos passaram'} do prazo`,
          blocos: [
            {
              titulo: 'O que significa',
              texto:
                'Empréstimos que continuam em andamento depois do prazo combinado na retirada.',
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Empréstimos em andamento cuja data de devolução prevista já passou. O atraso é calculado na hora: não depende de ninguém marcá-lo.',
            },
            {
              titulo: 'O que fazer',
              texto: geral
                ? 'Entre em contato com quem está com o equipamento. A lista abaixo mostra os mais atrasados primeiro.'
                : 'Devolva o equipamento assim que puder: outras pessoas podem estar esperando por ele.',
            },
          ],
          atrasados: true,
          link: {
            rotulo: geral ? 'Ver os empréstimos' : 'Ver meus empréstimos',
            rota: geral ? '/emprestimos' : '/meus-emprestimos',
          },
        },
      },
      {
        id: 'retiradas',
        rotulo: `Retiradas (${d.dias} dias)`,
        valor: this.numero(k.retiradasNoPeriodo),
        tom: 'neutro',
        info: {
          titulo: 'Retiradas no período',
          destaque: `${k.retiradasNoPeriodo} retiradas ${periodo}`,
          blocos: [
            {
              titulo: 'O que significa',
              texto: `Quantos equipamentos foram retirados ${periodo} ${quem}.`,
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Contagem de empréstimos criados dentro do período escolhido. É a soma da linha azul do gráfico "Movimentação diária".',
            },
            {
              titulo: 'Para que serve',
              texto:
                'Mede o volume de uso. Troque o período no seletor do topo para comparar semanas e meses.',
            },
          ],
        },
      },
      {
        id: 'devolucoes',
        rotulo: `Devoluções (${d.dias} dias)`,
        valor: this.numero(k.devolvidosNoPeriodo),
        tom: 'neutro',
        info: {
          titulo: 'Devoluções no período',
          destaque: `${k.devolvidosNoPeriodo} devoluções ${periodo}`,
          blocos: [
            {
              titulo: 'O que significa',
              texto: `Quantos equipamentos voltaram ${periodo} ${quem}.`,
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Contagem de empréstimos devolvidos dentro do período. É a soma da linha laranja tracejada do gráfico "Movimentação diária".',
            },
            {
              titulo: 'Para que serve',
              texto:
                'Se as retiradas superam as devoluções por muito tempo, o acervo está esvaziando.',
            },
          ],
        },
      },
      {
        id: 'pontualidade',
        rotulo: 'Devoluções no prazo',
        valor: this.numero(k.pontualidade, '%'),
        tom:
          k.pontualidade === null
            ? 'neutro'
            : k.pontualidade >= 80
              ? 'ok'
              : k.pontualidade >= 60
                ? 'aviso'
                : 'erro',
        info: {
          titulo: 'Devoluções no prazo',
          destaque:
            k.pontualidade === null
              ? 'Ainda não há devoluções no período'
              : `${k.pontualidade}% das devoluções ${periodo} foram pontuais`,
          blocos: [
            {
              titulo: 'O que significa',
              texto:
                'De cada 100 equipamentos devolvidos, quantos voltaram dentro do prazo combinado.',
            },
            {
              titulo: 'Como é calculado',
              texto:
                'Devoluções feitas até a data prevista, divididas pelo total de devoluções do período. Empréstimos ainda em andamento não entram: eles aparecem em "atrasados".',
            },
            {
              titulo: 'Como interpretar',
              texto:
                'A partir de 80% é um bom resultado. Abaixo de 60%, vale rever os prazos oferecidos ou reforçar os lembretes.',
            },
          ],
        },
      },
      {
        id: 'tempo',
        rotulo: 'Tempo médio com a pessoa',
        valor: this.numero(k.tempoMedioDias, ' dias'),
        tom: 'neutro',
        info: {
          titulo: 'Tempo médio com a pessoa',
          destaque:
            k.tempoMedioDias === null
              ? 'Ainda não há devoluções no período'
              : `${this.numero(k.tempoMedioDias)} dias entre retirar e devolver`,
          blocos: [
            {
              titulo: 'O que significa',
              texto: 'Por quanto tempo, em média, um equipamento fica com quem o pegou.',
            },
            {
              titulo: 'Como é calculado',
              texto: `Média de (data da devolução − data da retirada) nos empréstimos devolvidos ${periodo}.`,
            },
            {
              titulo: 'Para que serve',
              texto:
                'Ajuda a definir o prazo padrão: se quase todo mundo devolve em 5 dias, prazos de 30 dias deixam equipamentos parados à toa.',
            },
          ],
        },
      },
    ];
  });

  // Explicações dos gráficos (o "i" no canto de cada card)
  protected readonly infoSerie = computed<Info>(() => ({
    titulo: 'Movimentação diária',
    blocos: [
      {
        titulo: 'O que mostra',
        texto: `Quantas retiradas (linha azul contínua) e devoluções (linha laranja tracejada) aconteceram em cada um dos últimos ${this.dados()?.dias ?? ''} dias.`,
      },
      {
        titulo: 'Como ler',
        texto:
          'Passe o mouse sobre o gráfico para ver os números de um dia. Picos de retirada costumam vir seguidos de picos de devolução alguns dias depois. Para ver tudo em texto, abra "Ver os dados em tabela".',
      },
    ],
  }));

  protected readonly infoAcervo: Info = {
    titulo: 'Situação do acervo',
    blocos: [
      {
        titulo: 'O que mostra',
        texto:
          'A divisão dos equipamentos em disponíveis (podem ser retirados), emprestados (com alguém) e desativados (fora de uso).',
      },
      {
        titulo: 'Como ler',
        texto:
          'Cada fatia é a parte do total. O número no centro é a quantidade de equipamentos cadastrados. Este gráfico não depende do período escolhido: mostra o estado de agora.',
      },
    ],
  };

  protected readonly infoEquipamentos = computed<Info>(() => ({
    titulo: 'Equipamentos mais emprestados',
    blocos: [
      {
        titulo: 'O que mostra',
        texto: `Os 5 equipamentos que mais saíram nos últimos ${this.dados()?.dias ?? ''} dias${this.geral() ? '' : ', nos seus empréstimos'}.`,
      },
      {
        titulo: 'Para que serve',
        texto:
          'Indica o que as pessoas mais procuram. Itens muito disputados podem pedir uma segunda unidade; os que nunca aparecem talvez não precisem ficar no acervo.',
      },
    ],
  }));

  protected readonly infoPessoas = computed<Info>(() => ({
    titulo: 'Pessoas com mais empréstimos',
    blocos: [
      {
        titulo: 'O que mostra',
        texto: `As 5 pessoas que mais retiraram equipamentos nos últimos ${this.dados()?.dias ?? ''} dias. Só administradores veem este gráfico.`,
      },
      {
        titulo: 'Para que serve',
        texto: 'Ajuda a entender quem mais usa o serviço e a quem pedir feedback.',
      },
    ],
  }));

  protected readonly infoAtrasos: Info = {
    titulo: 'Maiores atrasos',
    atrasados: true,
    blocos: [
      {
        titulo: 'O que mostra',
        texto:
          'Os empréstimos que mais passaram do prazo, com o equipamento, a pessoa e quantos dias de atraso.',
      },
      {
        titulo: 'O que fazer',
        texto: 'Priorize os de cima da lista: são os que estão parados há mais tempo.',
      },
    ],
  };

  protected readonly infoPendentes: Info = {
    titulo: 'Com você agora',
    blocos: [
      {
        titulo: 'O que mostra',
        texto:
          'Os equipamentos que você retirou e ainda não devolveu, com a data limite de cada um.',
      },
      {
        titulo: 'Como devolver',
        texto: 'Abra "Meus empréstimos" e use o botão Devolver ao lado do equipamento.',
      },
    ],
    link: { rotulo: 'Ir para meus empréstimos', rota: '/meus-emprestimos' },
  };
}
