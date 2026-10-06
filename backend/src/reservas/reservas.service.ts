import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '../../generated/prisma/client';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { EmailService } from '../email/email.service';
import { emailEquipamentoDisponivel } from '../email/modelos';
import { CriarReservaDto } from './dto/criar-reserva.dto';
import { ReservasRepository } from './reservas.repository';

@Injectable()
export class ReservasService {
  private readonly log = new Logger('Reservas');

  constructor(
    private readonly reservas: ReservasRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async criar(usuario: UsuarioAutenticado, dto: CriarReservaDto) {
    const equipamento = await this.reservas.buscarEquipamento(dto.equipamentoId);
    if (!equipamento) throw new NotFoundException('Equipamento não encontrado.');
    if (!equipamento.ativo) throw new ConflictException('Este equipamento está fora de uso e não tem fila.');
    await this.reservas.promover(equipamento.id); // fila em ordem antes de decidir
    const reservado = (await this.reservas.emVez([equipamento.id])).has(equipamento.id);
    if (equipamento.emprestimos.length === 0 && !reservado) {
      throw new ConflictException('Este equipamento está disponível agora: pegue-o direto, sem fila.');
    }
    if (equipamento.emprestimos.some((e) => e.usuarioId === usuario.id)) {
      throw new ConflictException('Você já está com este equipamento.');
    }

    try {
      const reserva = await this.reservas.criar(usuario.id, equipamento.id);
      const [minha] = (await this.reservas.minhas(usuario.id)).filter((r) => r.id === reserva.id);
      return paraRespostaDaFila(minha);
    } catch (erro) {
      // O índice único parcial barra a segunda entrada, mesmo com dois cliques ao mesmo tempo
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Você já está na fila deste equipamento.');
      }
      throw erro;
    }
  }

  async minhas(usuarioId: number) {
    return (await this.reservas.minhas(usuarioId)).map(paraRespostaDaFila);
  }

  async cancelar(usuario: UsuarioAutenticado, id: number) {
    const reserva = await this.reservas.buscarPorId(id);
    if (!reserva) throw new NotFoundException('Reserva não encontrada.');
    if (reserva.usuarioId !== usuario.id && usuario.role !== Role.ADMIN) {
      throw new ForbiddenException('Você só pode sair das suas próprias filas.');
    }
    if (!(await this.reservas.cancelar(id))) throw new ConflictException('Esta reserva já não está na fila.');
    // Se era quem tinha a vez, ela passa para o próximo da fila
    await this.reservas.promover(reserva.equipamentoId);
    this.avisarPendentes();
  }

  /** Quantas pessoas esperam por cada equipamento. */
  tamanhoDasFilas(equipamentoIds: number[]) {
    return this.reservas.tamanhoDasFilas(equipamentoIds);
  }

  /** A pessoa pegou o equipamento: sai da fila dele. */
  atendida(usuarioId: number, equipamentoId: number) {
    return this.reservas.marcarAtendida(usuarioId, equipamentoId);
  }

  /** Passa a vez de quem deixou o prazo vencer e avisa quem passou a ter a vez. Roda a cada 5 minutos. */
  @Interval(5 * 60_000)
  async manterFilas(): Promise<void> {
    try {
      for (const id of await this.reservas.equipamentosComFila()) await this.reservas.promover(id);
      await this.enviarAvisos();
    } catch (erro) {
      this.log.error(`Falha ao manter as filas: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`);
    }
  }

  /**
   * Avisa por e-mail quem tem a vez agora. Em segundo plano e sem nunca derrubar a ação de quem chamou (a devolução
   * já valeu): se o e-mail falhar, o erro só vai para o log.
   */
  avisarPendentes(): void {
    void this.enviarAvisos().catch((erro: unknown) =>
      this.log.error(`Falha ao avisar a fila: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`),
    );
  }

  private async enviarAvisos(): Promise<void> {
    for (const vez of await this.reservas.vezesSemAviso()) {
      if (!(await this.reservas.reivindicarAviso(vez.id, new Date()))) continue;
      await this.email.enviar(
        emailEquipamentoDisponivel({
          para: vez.usuario.email,
          nome: vez.usuario.nome,
          equipamento: vez.equipamento.nome,
          link: `${this.config.getOrThrow<string>('appUrl')}/equipamentos`,
          ate: vez.prioridadeAte
            ? vez.prioridadeAte.toLocaleString('pt-BR', {
                timeZone: this.config.getOrThrow<string>('notificacoesFuso'),
              })
            : undefined,
        }),
      );
    }
  }

  /** Quais equipamentos estão reservados para alguém agora. */
  emVez(equipamentoIds: number[]) {
    return this.reservas.emVez(equipamentoIds);
  }
}

function paraRespostaDaFila(r: {
  id: number;
  criadoEm: Date;
  posicao: number;
  prioridadeAte: Date | null;
  equipamento: { id: number; codigo: string; nome: string };
}) {
  // minhaVez: o prazo exclusivo para pegar o equipamento ainda vale para esta pessoa
  const minhaVez = !!r.prioridadeAte && r.prioridadeAte.getTime() > Date.now();
  return {
    id: r.id,
    criadoEm: r.criadoEm,
    posicao: r.posicao,
    minhaVez,
    prioridadeAte: minhaVez ? r.prioridadeAte : null,
    equipamento: r.equipamento,
  };
}
