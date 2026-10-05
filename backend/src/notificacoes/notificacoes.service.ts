import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EmailService } from '../email/email.service';
import { emailEmprestimoAtrasado, emailLembreteDevolucao, emailResumoAtrasos } from '../email/modelos';
import { NotificacoesRepository } from './notificacoes.repository';

const DIA_MS = 86_400_000;
export const INTERVALO_COBRANCA_DIAS = 3;

export interface ResultadoNotificacoes {
  lembretes: number;
  atrasos: number;
  resumosParaAdmins: number;
}

// Avisos por e-mail: lembrete 24h antes do prazo, cobrança de atraso (a cada 3 dias enquanto não devolver) e um
// resumo dos atrasos para os administradores. Rodam todo dia no horário configurado e também sob demanda.
@Injectable()
export class NotificacoesService implements OnModuleInit {
  private readonly log = new Logger('Notificacoes');

  constructor(
    private readonly repo: NotificacoesRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly agendador: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (!this.config.getOrThrow<boolean>('notificacoesAtivas')) {
      this.log.log('Avisos automáticos desligados (NOTIFICACOES_ATIVAS=false).');
      return;
    }
    const expressao = this.config.getOrThrow<string>('notificacoesCron');
    const fuso = this.config.getOrThrow<string>('notificacoesFuso');
    // CronJob lança erro para expressão ou fuso inválidos: a aplicação não sobe com um agendamento que não funciona
    const tarefa = CronJob.from({
      cronTime: expressao,
      timeZone: fuso,
      start: true,
      onTick: () => {
        this.executar().catch((erro: unknown) =>
          this.log.error(`Falha na rotina de avisos: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`),
        );
      },
    });
    this.agendador.addCronJob('avisos-de-emprestimo', tarefa);
    this.log.log(`Avisos automáticos agendados: "${expressao}" (${fuso}).`);
  }

  async executar(agora = new Date()): Promise<ResultadoNotificacoes> {
    const base = this.config.getOrThrow<string>('appUrl');
    const link = `${base}/meus-emprestimos`;
    const resultado: ResultadoNotificacoes = { lembretes: 0, atrasos: 0, resumosParaAdmins: 0 };

    for (const e of await this.repo.paraLembrar(agora)) {
      if (!e.usuario.ativo) continue;
      if (!(await this.repo.reivindicarLembrete(e.id, agora))) continue; // outra instância já avisou
      await this.enviar(
        emailLembreteDevolucao({
          para: e.usuario.email,
          nome: e.usuario.nome,
          equipamento: e.equipamento.nome,
          prazo: e.prazoDevolucao,
          link,
        }),
        e.usuario.id,
      );
      resultado.lembretes++;
    }

    const cobrados: { equipamento: string; pessoa: string; diasDeAtraso: number }[] = [];
    for (const e of await this.repo.paraCobrar(agora, INTERVALO_COBRANCA_DIAS)) {
      if (!e.usuario.ativo) continue;
      if (!(await this.repo.reivindicarAvisoDeAtraso(e.id, agora, INTERVALO_COBRANCA_DIAS))) continue;
      const diasDeAtraso = Math.max(1, Math.floor((agora.getTime() - e.prazoDevolucao.getTime()) / DIA_MS));
      await this.enviar(
        emailEmprestimoAtrasado({
          para: e.usuario.email,
          nome: e.usuario.nome,
          equipamento: e.equipamento.nome,
          prazo: e.prazoDevolucao,
          diasDeAtraso,
          link,
        }),
        e.usuario.id,
      );
      cobrados.push({ equipamento: e.equipamento.nome, pessoa: e.usuario.nome, diasDeAtraso });
      resultado.atrasos++;
    }

    // Os administradores recebem um resumo só quando ESTA rodada cobrou alguém (sem e-mail repetido todo dia)
    if (cobrados.length > 0) {
      for (const admin of await this.repo.administradoresAtivos()) {
        await this.enviar(
          emailResumoAtrasos({ para: admin.email, nome: admin.nome, itens: cobrados, link: `${base}/emprestimos` }),
          admin.id,
        );
        resultado.resumosParaAdmins++;
      }
    }

    this.log.log(
      `Avisos: ${resultado.lembretes} lembretes, ${resultado.atrasos} atrasos, ${resultado.resumosParaAdmins} resumos.`,
    );
    return resultado;
  }

  // Uma falha de envio (SMTP fora do ar) não derruba a rotina nem os outros avisos; só o id de quem e o motivo vão ao log
  private async enviar(mensagem: Parameters<EmailService['enviar']>[0], usuarioId: number) {
    try {
      await this.email.enviar(mensagem);
    } catch (erro) {
      this.log.error(
        `Falha ao enviar "${mensagem.assunto}" (usuário ${usuarioId}): ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      );
    }
  }
}
