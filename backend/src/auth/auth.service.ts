import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Role } from '../../generated/prisma/enums';
import { SessoesRepository } from '../sessoes/sessoes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { POLITICA_VERSAO } from '../common/politica';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import { TokensCompletos } from './dto/tokens-resposta.dto';

const MS_POR_DIA = 24 * 3_600_000;
const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly custo: number;
  // Hash de uma senha qualquer, comparado quando o e-mail não existe: o tempo de resposta fica parecido
  // e não dá para descobrir quais e-mails estão cadastrados medindo a demora.
  private readonly hashFalso: string;

  constructor(
    private readonly usuarios: UsuariosRepository,
    private readonly sessoes: SessoesRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {
    this.custo = this.config.getOrThrow<number>('bcryptCusto');
    this.hashFalso = bcrypt.hashSync('senha-falsa-para-igualar-o-tempo', this.custo);
  }

  /** Cadastro público: SEMPRE cria um USER. Não existe caminho aqui para virar administrador. */
  async registrar(dto: RegistrarUsuarioDto) {
    if (!this.config.getOrThrow<boolean>('cadastroPublico')) {
      throw new ForbiddenException(
        'O cadastro aberto está desativado. Peça a um administrador para criar a sua conta.',
      );
    }
    const senhaHash = await bcrypt.hash(dto.senha, this.custo);
    const criado = await this.usuarios.criar({
      nome: dto.nome,
      email: dto.email,
      senhaHash,
      role: Role.USER,
      // Registro do consentimento: quando e qual versão da política a pessoa aceitou
      politicaAceitaEm: new Date(),
      politicaVersao: POLITICA_VERSAO,
    });
    if (!criado) throw new ConflictException('Já existe um usuário com esse e-mail.');
    return criado;
  }

  cadastroPublico(): boolean {
    return this.config.getOrThrow<boolean>('cadastroPublico');
  }

  async login(dto: LoginDto): Promise<TokensCompletos> {
    const usuario = await this.usuarios.buscarPorEmailComHash(dto.email);
    const senhaConfere = await bcrypt.compare(dto.senha, usuario?.senhaHash ?? this.hashFalso);

    // Mesma mensagem para e-mail inexistente, senha errada e conta desativada: não revela qual foi o caso.
    if (!usuario || !senhaConfere || !usuario.ativo) throw new UnauthorizedException('Credenciais inválidas.');

    await this.sessoes.removerAntigos(usuario.id);
    return this.emitirTokens(usuario.id);
  }

  /**
   * Troca um refresh token por um par novo (rotação). O token antigo morre na hora.
   * Se alguém apresentar um token JÁ usado, é sinal de roubo: todas as sessões da pessoa são encerradas.
   */
  async renovar(refreshToken: string): Promise<TokensCompletos> {
    const sessao = await this.sessoes.buscarPorHash(hashDoToken(refreshToken));
    if (!sessao) throw new UnauthorizedException('Sessão inválida. Entre novamente.');

    if (sessao.revogadoEm) {
      void this.auditoria.registrar({
        atorId: sessao.usuarioId,
        acao: 'SESSAO_REUTILIZADA',
        entidade: 'usuario',
        entidadeId: sessao.usuarioId,
      });
      await this.sessoes.revogarTodasDoUsuario(sessao.usuarioId);
      throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    }
    if (sessao.expiraEm.getTime() < Date.now()) throw new UnauthorizedException('Sessão expirada. Entre novamente.');

    const usuario = await this.usuarios.buscarAutenticacao(sessao.usuarioId);
    if (!usuario || !usuario.ativo) throw new UnauthorizedException('Sessão inválida. Entre novamente.');

    // Revogação atômica: se outro pedido com o mesmo token chegou junto, só um vence.
    if (!(await this.sessoes.revogar(sessao.id))) {
      void this.auditoria.registrar({
        atorId: sessao.usuarioId,
        acao: 'SESSAO_REUTILIZADA',
        entidade: 'usuario',
        entidadeId: sessao.usuarioId,
      });
      await this.sessoes.revogarTodasDoUsuario(sessao.usuarioId);
      throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    }
    return this.emitirTokens(usuario.id);
  }

  /** Encerra uma sessão. Idempotente: sair duas vezes, ou com um token desconhecido, não dá erro. */
  async sair(refreshToken: string): Promise<void> {
    const sessao = await this.sessoes.buscarPorHash(hashDoToken(refreshToken));
    if (sessao && !sessao.revogadoEm) await this.sessoes.revogar(sessao.id);
  }

  /** Troca a senha e encerra TODAS as sessões (a pessoa entra de novo com a senha nova). */
  async alterarSenha(usuarioId: number, dto: AlterarSenhaDto): Promise<void> {
    const usuario = await this.usuarios.buscarPorIdComHash(usuarioId);
    if (!usuario) throw new UnauthorizedException('Sessão inválida. Entre novamente.');

    if (!(await bcrypt.compare(dto.senhaAtual, usuario.senhaHash))) {
      throw new UnprocessableEntityException('A senha atual está incorreta.');
    }
    if (dto.novaSenha === dto.senhaAtual) throw new BadRequestException('A nova senha deve ser diferente da atual.');

    await this.usuarios.atualizar(usuarioId, { senhaHash: await bcrypt.hash(dto.novaSenha, this.custo) });
    await this.sessoes.revogarTodasDoUsuario(usuarioId);
  }

  private async emitirTokens(usuarioId: number): Promise<TokensCompletos> {
    // O token de acesso leva só o id: papel e situação da conta são lidos do banco a cada requisição.
    const accessToken = await this.jwt.signAsync({ sub: usuarioId });
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);

    const refreshToken = randomBytes(48).toString('base64url');
    const dias = this.config.getOrThrow<number>('refreshDias');
    await this.sessoes.criar({
      usuarioId,
      tokenHash: hashDoToken(refreshToken),
      expiraEm: new Date(Date.now() + dias * MS_POR_DIA),
    });

    return { accessToken, refreshToken, tipo: 'Bearer', accessTokenExpiraEm: new Date(exp * 1000) };
  }
}
