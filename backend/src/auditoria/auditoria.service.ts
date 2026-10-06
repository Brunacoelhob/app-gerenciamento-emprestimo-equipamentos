import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { intervalo, montarPagina } from '../common/dto/pagina';
import { PrismaService } from '../prisma/prisma.service';
import { FormatoRelatorio, RelatoriosService } from '../relatorios/relatorios.service';
import {
  AcaoAuditoria,
  CATALOGO_ACOES,
  descreverDetalhes,
  detalhesEmTexto,
  infoDaAcao,
  rotuloDaEntidade,
} from './auditoria.catalogo';
import { FiltroAuditoriaDto, ListarAuditoriaDto } from './dto/listar-auditoria.dto';

export type { AcaoAuditoria } from './auditoria.catalogo';

export interface EntradaAuditoria {
  atorId?: number | null;
  acao: AcaoAuditoria;
  entidade: 'usuario' | 'equipamento' | 'emprestimo' | 'auditoria';
  entidadeId?: number | null;
  detalhes?: Record<string, unknown> | null;
}

/** Quantos registros um relatório leva no máximo (acima disso o arquivo avisa que foi cortado). */
export const LIMITE_RELATORIO = 5000;

// Trilha de auditoria: quem fez o quê e quando, nas ações que mexem em contas, permissões e acervo.
// É "melhor esforço": se gravar falhar, a ação do usuário NÃO é desfeita (o erro vai para o log).
@Injectable()
export class AuditoriaService {
  private readonly log = new Logger('Auditoria');

  constructor(
    private readonly prisma: PrismaService,
    private readonly relatorios: RelatoriosService,
    private readonly config: ConfigService,
  ) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      // O nome fica gravado junto: o registro continua legível mesmo se a conta for anonimizada depois
      const ator = entrada.atorId
        ? await this.prisma.usuario.findUnique({ where: { id: entrada.atorId }, select: { nome: true } })
        : null;
      await this.prisma.registroAuditoria.create({
        data: {
          atorId: entrada.atorId ?? null,
          atorNome: ator?.nome ?? null,
          acao: entrada.acao,
          entidade: entrada.entidade,
          entidadeId: entrada.entidadeId ?? null,
          detalhes: (entrada.detalhes ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (erro) {
      this.log.error(
        `Falha ao registrar ${entrada.acao}: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      );
    }
  }

  /** As ações que existem, com texto e categoria (alimenta o filtro da tela). */
  acoes() {
    return Object.entries(CATALOGO_ACOES).map(([valor, info]) => ({ valor, ...info }));
  }

  async listar(dto: ListarAuditoriaDto) {
    const where = this.filtro(dto);
    const [total, itens] = await Promise.all([
      this.prisma.registroAuditoria.count({ where }),
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        ...intervalo(dto),
      }),
    ]);
    return montarPagina(
      itens.map((r) => {
        const info = infoDaAcao(r.acao);
        return {
          ...r,
          acaoRotulo: info.rotulo,
          categoria: info.categoria,
          critica: info.critica,
          entidadeRotulo: rotuloDaEntidade(r.entidade),
          descricao: descreverDetalhes(r.entidade, r.detalhes),
        };
      }),
      total,
      dto,
    );
  }

  /**
   * Relatório dos registros que casam com os filtros (TODOS, não só a página da tela), até LIMITE_RELATORIO.
   * Data e hora saem em colunas separadas, no fuso configurado.
   */
  async exportar(dto: FiltroAuditoriaDto, formato: FormatoRelatorio, atorId: number) {
    const where = this.filtro(dto);
    const [total, registros] = await Promise.all([
      this.prisma.registroAuditoria.count({ where }),
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: LIMITE_RELATORIO,
      }),
    ]);
    const cortado = total > registros.length;

    const fuso = this.config.getOrThrow<string>('notificacoesFuso');
    const data = new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const hora = new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    const filtros = [
      dto.acao && `ação: ${infoDaAcao(dto.acao).rotulo}`,
      dto.busca?.trim() && `busca: "${dto.busca.trim()}"`,
      dto.atorId && `pessoa nº ${dto.atorId}`,
    ].filter(Boolean);
    const subtitulo =
      `Gerado em ${data.format(new Date())} às ${hora.format(new Date())} (${fuso}). ` +
      `Filtros: ${filtros.length ? filtros.join(', ') : 'nenhum'}. ` +
      (cortado
        ? `ATENÇÃO: o filtro tem ${total} registros e este arquivo traz só os ${registros.length} mais recentes.`
        : `${total} ${total === 1 ? 'registro' : 'registros'}.`);

    const arquivo = await this.relatorios.gerar(formato, {
      titulo: 'Relatório de auditoria',
      subtitulo,
      colunas: [
        { chave: 'data', titulo: 'Data', largura: 11 },
        { chave: 'hora', titulo: 'Hora', largura: 9 },
        { chave: 'quem', titulo: 'Quem', largura: 20 },
        { chave: 'acao', titulo: 'Ação', largura: 28 },
        { chave: 'registro', titulo: 'Registro afetado', largura: 18 },
        { chave: 'detalhes', titulo: 'Detalhes', largura: 42 },
      ],
      linhas: registros.map((r) => ({
        data: data.format(r.criadoEm),
        hora: hora.format(r.criadoEm),
        quem: r.atorNome ?? 'Sistema',
        acao: infoDaAcao(r.acao).rotulo,
        registro: r.entidadeId ? `${rotuloDaEntidade(r.entidade)} nº ${r.entidadeId}` : rotuloDaEntidade(r.entidade),
        detalhes: detalhesEmTexto(r.entidade, r.detalhes),
      })),
    });

    // Quem baixou a trilha também fica na trilha
    await this.registrar({
      atorId,
      acao: 'AUDITORIA_EXPORTADA',
      entidade: 'auditoria',
      detalhes: { formato, linhas: registros.length },
    });
    return { ...arquivo, total, cortado };
  }

  private filtro(dto: FiltroAuditoriaDto): Prisma.RegistroAuditoriaWhereInput {
    return {
      ...(dto.acao && { acao: dto.acao }),
      ...(dto.atorId && { atorId: dto.atorId }),
      ...(dto.busca?.trim() && {
        OR: [
          { atorNome: { contains: dto.busca.trim(), mode: 'insensitive' as const } },
          ...(/^\d{1,9}$/.test(dto.busca.trim()) ? [{ entidadeId: Number(dto.busca.trim()) }] : []),
        ],
      }),
    };
  }
}
