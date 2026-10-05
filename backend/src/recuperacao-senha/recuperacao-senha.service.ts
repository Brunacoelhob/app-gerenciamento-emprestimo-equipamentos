import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { EmailService } from '../email/email.service';
import { emailRecuperacaoSenha, emailSenhaAlterada } from '../email/modelos';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';

export const VALIDADE_MINUTOS = 30;
export const LIMITE_POR_HORA = 3;

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');
const LINK_INVALIDO = 'Este link é inválido ou expirou. Peça um novo na tela de login.';

@Injectable()
export class RecuperacaoSenhaService {
  private readonly log = new Logger('RecuperacaoSenha');

  constructor(
    private readonly pedidos: RecuperacaoSenhaRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly sessoes: SessoesRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * "Esqueci minha senha". A resposta é SEMPRE a mesma, exista a conta ou não: quem pergunta não descobre quais
   * e-mails estão cadastrados. O envio é feito em segundo plano pelo mesmo motivo (o tempo de resposta não
   * revela se algum e-mail foi mandado).
   */
  async solicitar(emailInformado: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorEmailComHash(emailInformado);
    if (!usuario?.ativo) return; // conta inexistente ou desativada: nada é enviado
    if ((await this.pedidos.contarDaUltimaHora(usuario.id)) >= LIMITE_POR_HORA) return; // sem inundar a caixa de entrada

    const token = randomBytes(32).toString('base64url');
    await this.pedidos.invalidarPendentes(usuario.id);
    await this.pedidos.criar({
      usuarioId: usuario.id,
      tokenHash: hashDoToken(token),
      expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
    });

    const link = `${this.config.getOrThrow<string>('appUrl')}/redefinir-senha?token=${token}`;
    this.enviarEmSegundoPlano(
      emailRecuperacaoSenha({ para: usuario.email, nome: usuario.nome, link, validadeMinutos: VALIDADE_MINUTOS }),
      usuario.id,
    );
  }

  /** Define a nova senha com o link recebido por e-mail. Usa o token uma única vez e encerra todas as sessões. */
  async redefinir(token: string, novaSenha: string): Promise<void> {
    const pedido = await this.pedidos.buscarPorHash(hashDoToken(token));
    if (!pedido || pedido.usadoEm || pedido.expiraEm.getTime() <= Date.now())
      throw new BadRequestException(LINK_INVALIDO);

    const usuario = await this.usuarios.buscarPorIdComHash(pedido.usuarioId);
    if (!usuario?.ativo) throw new BadRequestException(LINK_INVALIDO);

    // O hash é calculado ANTES de consumir o link: se algo falhar aqui, o link continua valendo.
    const senhaHash = await bcrypt.hash(novaSenha, this.config.getOrThrow<number>('bcryptCusto'));
    if (!(await this.pedidos.consumir(pedido.id))) throw new BadRequestException(LINK_INVALIDO);

    await this.usuarios.atualizar(usuario.id, { senhaHash });
    await this.sessoes.revogarTodasDoUsuario(usuario.id); // quem tinha a senha antiga (ou um token roubado) sai
    await this.pedidos.invalidarPendentes(usuario.id);

    this.enviarEmSegundoPlano(emailSenhaAlterada({ para: usuario.email, nome: usuario.nome }), usuario.id);
  }

  private enviarEmSegundoPlano(mensagem: Parameters<EmailService['enviar']>[0], usuarioId: number) {
    // Nunca registra o conteúdo (o link é uma credencial): só quem e o motivo da falha
    this.email
      .enviar(mensagem)
      .catch((erro: unknown) =>
        this.log.error(
          `Falha ao enviar e-mail "${mensagem.assunto}" (usuário ${usuarioId}): ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
        ),
      );
  }
}
