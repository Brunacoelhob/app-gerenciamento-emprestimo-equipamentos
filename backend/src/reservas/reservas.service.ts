import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    if (equipamento.emprestimos.length === 0) {
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
  }

  /** Quantas pessoas esperam por cada equipamento. */
  tamanhoDasFilas(equipamentoIds: number[]) {
    return this.reservas.tamanhoDasFilas(equipamentoIds);
  }

  /** A pessoa pegou o equipamento: sai da fila dele. */
  atendida(usuarioId: number, equipamentoId: number) {
    return this.reservas.marcarAtendida(usuarioId, equipamentoId);
  }

  /**
   * O equipamento foi devolvido: avisa por e-mail quem espera há mais tempo. Em segundo plano e sem nunca derrubar
   * a devolução: se o e-mail falhar, a devolução já valeu e o erro só vai para o log.
   */
  avisarProximo(equipamentoId: number): void {
    void (async () => {
      const proximo = await this.reservas.primeiroDaFila(equipamentoId);
      if (!proximo) return;
      await this.reservas.registrarAviso(proximo.id, new Date());
      await this.email.enviar(
        emailEquipamentoDisponivel({
          para: proximo.usuario.email,
          nome: proximo.usuario.nome,
          equipamento: proximo.equipamento.nome,
          link: `${this.config.getOrThrow<string>('appUrl')}/equipamentos`,
        }),
      );
    })().catch((erro: unknown) =>
      this.log.error(
        `Falha ao avisar a fila do equipamento ${equipamentoId}: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      ),
    );
  }
}

function paraRespostaDaFila(r: {
  id: number;
  criadoEm: Date;
  posicao: number;
  equipamento: { id: number; codigo: string; nome: string };
}) {
  return { id: r.id, criadoEm: r.criadoEm, posicao: r.posicao, equipamento: r.equipamento };
}
