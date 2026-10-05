import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Role } from '../../generated/prisma/enums';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EmailService } from '../email/email.service';
import { emailContaRemovida } from '../email/modelos';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { PrivacidadeRepository } from './privacidade.repository';

// Direitos do titular dos dados (LGPD): acessar/levar os próprios dados e pedir a exclusão da conta.
@Injectable()
export class PrivacidadeService {
  private readonly log = new Logger('Privacidade');

  constructor(
    private readonly repo: PrivacidadeRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly auditoria: AuditoriaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Tudo o que o sistema guarda sobre a pessoa, em formato legível por máquina (portabilidade). */
  async exportar(usuarioId: number) {
    const perfil = await this.usuarios.buscarPorId(usuarioId);
    if (!perfil) throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    const [emprestimos, acoes] = await Promise.all([
      this.repo.emprestimosDaPessoa(usuarioId),
      this.repo.acoesDaPessoa(usuarioId),
    ]);
    return {
      geradoEm: new Date().toISOString(),
      observacao:
        'Dados pessoais guardados por este sistema. A senha não é exportada: ela existe apenas como um código irreversível (hash).',
      perfil,
      emprestimos: emprestimos.map((e) => ({
        id: e.id,
        equipamento: e.equipamento.nome,
        status: e.status,
        retiradoEm: e.dataRetirada,
        prazoDevolucao: e.prazoDevolucao,
        devolvidoEm: e.dataDevolucao,
      })),
      acoesRegistradas: acoes,
    };
  }

  /**
   * Exclui a conta por anonimização. Exige a senha (um token roubado não apaga a conta) e recusa quando a pessoa
   * ainda está com equipamentos ou é o último administrador ativo. O histórico de empréstimos é preservado, sem
   * identificar ninguém.
   */
  async anonimizar(usuarioId: number, senha: string): Promise<void> {
    const conta = await this.usuarios.buscarPorIdComHash(usuarioId);
    if (!conta?.ativo) throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    if (!(await bcrypt.compare(senha, conta.senhaHash))) {
      throw new UnprocessableEntityException('A senha está incorreta.');
    }
    if ((await this.repo.contarEmprestimosEmAndamento(usuarioId)) > 0) {
      throw new ConflictException('Você ainda está com equipamentos emprestados. Devolva-os antes de excluir a conta.');
    }
    if (conta.role === Role.ADMIN && (await this.usuarios.contarAdminsAtivos()) <= 1) {
      throw new ConflictException(
        'Você é o último administrador ativo. Promova outra pessoa antes de excluir a conta.',
      );
    }

    const custo = this.config.getOrThrow<number>('bcryptCusto');
    const emailAnterior = conta.email;
    const nomeAnterior = conta.nome;
    await this.repo.anonimizar(usuarioId, {
      email: `removido-${usuarioId}-${randomBytes(6).toString('hex')}@anonimizado.invalid`,
      senhaHash: await bcrypt.hash(randomBytes(32).toString('hex'), custo),
    });
    await this.auditoria.registrar({
      atorId: usuarioId,
      acao: 'CONTA_ANONIMIZADA',
      entidade: 'usuario',
      entidadeId: usuarioId,
    });

    // Confirmação para o e-mail antigo (em segundo plano: a exclusão já aconteceu)
    this.email
      .enviar(emailContaRemovida({ para: emailAnterior, nome: nomeAnterior }))
      .catch((erro: unknown) =>
        this.log.error(
          `Falha ao enviar a confirmação de exclusão (usuário ${usuarioId}): ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
        ),
      );
  }
}
