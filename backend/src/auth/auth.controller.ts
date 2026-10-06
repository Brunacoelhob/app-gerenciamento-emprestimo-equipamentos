import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auditar } from '../auditoria/auditar.decorator';
import { lerLimite } from '../config/limites';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Publica } from '../common/decorators/publica.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { AtualizarPerfilDto } from '../usuarios/dto/atualizar-perfil.dto';
import { UsuarioRespostaDto } from '../usuarios/dto/usuario-resposta.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import {
  limparCookie,
  lerCookieSessao,
  NOME_COOKIE,
  opcoesCookie,
  pediuTokenNoCorpo,
  temCabecalhoAntiCsrf,
} from './cookie-sessao';
import { RenovarSessaoDto } from './dto/renovar-sessao.dto';
import { TokensCompletos, TokensRespostaDto } from './dto/tokens-resposta.dto';

const UM_MINUTO = 60_000;
// 5 tentativas de login por minuto por IP (padrão). LIMITE_LOGIN_POR_MINUTO só deve subir em testes automatizados.
const LIMITE_LOGIN = lerLimite('LIMITE_LOGIN_POR_MINUTO', 5);
const LIMITE_CADASTRO = lerLimite('LIMITE_CADASTRO_POR_HORA', 10);
const UMA_HORA = 3_600_000;

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  private readonly cookieSeguro: boolean;
  private readonly diasDaSessao: number;

  constructor(
    private readonly auth: AuthService,
    private readonly usuarios: UsuariosService,
    config: ConfigService,
  ) {
    this.cookieSeguro = config.getOrThrow<boolean>('cookieSeguro');
    this.diasDaSessao = config.getOrThrow<number>('refreshDias');
  }

  // O refresh token vai para o cookie HttpOnly. Ele só aparece no corpo da resposta para quem pede (clientes que
  // não são navegadores): assim o JavaScript de uma página nunca o recebe.
  private entregarSessao(tokens: TokensCompletos, req: Request, res: Response): TokensRespostaDto {
    res.cookie(NOME_COOKIE, tokens.refreshToken, opcoesCookie(this.cookieSeguro, this.diasDaSessao));
    if (pediuTokenNoCorpo(req)) return tokens;
    return { accessToken: tokens.accessToken, tipo: tokens.tipo, accessTokenExpiraEm: tokens.accessTokenExpiraEm };
  }

  // Do corpo (clientes de API) ou do cookie (navegador). O cookie exige o cabeçalho anti-CSRF.
  private refreshTokenDaRequisicao(dto: RenovarSessaoDto, req: Request): string {
    if (dto.refreshToken) return dto.refreshToken;
    const doCookie = lerCookieSessao(req);
    if (!doCookie) throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    if (!temCabecalhoAntiCsrf(req)) throw new BadRequestException('Cabeçalho obrigatório ausente.');
    return doCookie;
  }

  @ApiOperation({
    summary: 'Configurações públicas que a tela de login precisa saber',
    description: 'Hoje: se o cadastro aberto está ligado (CADASTRO_PUBLICO).',
  })
  @ApiOkResponse({ description: 'Objeto com cadastroPublico (boolean).' })
  @Publica()
  @Get('configuracao')
  configuracao() {
    return { cadastroPublico: this.auth.cadastroPublico() };
  }

  @ApiOperation({
    summary: 'Cadastro público (a conta sempre nasce como USER)',
    description:
      'Não existe campo de papel: quem tentar enviar `role` recebe 400. Administradores só são criados por outro ADMIN.',
  })
  @ApiCreatedResponse({ type: UsuarioRespostaDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos (senha fraca, e-mail inválido, campo desconhecido...).' })
  @ApiConflictResponse({ description: 'Já existe um usuário com esse e-mail.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 cadastros por hora neste IP.' })
  @Publica()
  @Throttle({ default: { limit: LIMITE_CADASTRO, ttl: UMA_HORA } }) // cadastro em massa também é abuso
  @Post('registro')
  registrar(@Body() dto: RegistrarUsuarioDto) {
    return this.auth.registrar(dto);
  }

  @ApiOperation({ summary: 'Entra com e-mail e senha e recebe o par de tokens' })
  @ApiOkResponse({ type: TokensRespostaDto })
  @ApiBadRequestResponse({ description: 'Corpo inválido.' })
  @ApiUnauthorizedResponse({
    description: 'Credenciais inválidas (e-mail, senha ou conta desativada: a mensagem é a mesma).',
  })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas por minuto neste IP.' })
  @Publica()
  @Throttle({ default: { limit: LIMITE_LOGIN, ttl: UM_MINUTO } }) // freio contra força bruta
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.entregarSessao(await this.auth.login(dto), req, res);
  }

  @ApiOperation({
    summary: 'Renova a sessão: troca o refresh token por um par novo',
    description:
      'O refresh token é de uso único. Reapresentar um token já usado indica roubo e encerra todas as sessões da pessoa.',
  })
  @ApiOkResponse({ type: TokensRespostaDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido, expirado ou já usado.' })
  @Publica()
  @Throttle({ default: { limit: 30, ttl: UM_MINUTO } })
  @HttpCode(200)
  @Post('renovar')
  async renovar(@Body() dto: RenovarSessaoDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.refreshTokenDaRequisicao(dto, req);
    try {
      return this.entregarSessao(await this.auth.renovar(token), req, res);
    } catch (erro) {
      // Sessão inválida, vencida ou reutilizada: o cookie não serve mais e não deve continuar sendo reenviado
      if (erro instanceof UnauthorizedException) limparCookie(res, this.cookieSeguro);
      throw erro;
    }
  }

  @ApiOperation({ summary: 'Sai: invalida o refresh token informado (idempotente)' })
  @ApiNoContentResponse({ description: 'Sessão encerrada (ou já estava encerrada).' })
  @Publica()
  @HttpCode(204)
  @Post('sair')
  async sair(@Body() dto: RenovarSessaoDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? lerCookieSessao(req);
    if (token) await this.auth.sair(token);
    limparCookie(res, this.cookieSeguro); // sempre: sair com o cookie já vencido também limpa
  }

  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
  @Get('eu')
  eu(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.usuarios.obter(usuario.id);
  }

  @ApiOperation({
    summary: 'Edita o próprio perfil (nome, e-mail, CPF, telefone, endereço e avatar)',
    description:
      'Só os campos enviados mudam; `null` ou texto vazio apaga um campo opcional. Papel e situação da conta não são editáveis aqui.',
  })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos (CPF, CEP, telefone, avatar...).' })
  @ApiConflictResponse({ description: 'E-mail ou CPF já pertence a outra conta.' })
  @Auditar({
    entidade: 'usuario',
    acao: (c) => (c.email !== undefined ? 'EMAIL_ALTERADO' : null),
    entidadeDoAtor: true,
  })
  @Patch('eu')
  atualizarPerfil(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: AtualizarPerfilDto) {
    return this.usuarios.atualizarPerfil(usuario.id, dto);
  }

  @ApiOperation({ summary: 'Troca a própria senha (encerra todas as sessões)' })
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Senha alterada. É preciso entrar de novo.' })
  @ApiBadRequestResponse({ description: 'Nova senha fraca ou igual à atual.' })
  @ApiUnprocessableEntityResponse({ description: 'A senha atual está incorreta.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas por minuto.' })
  @Throttle({ default: { limit: 5, ttl: UM_MINUTO } })
  @HttpCode(204)
  @Auditar({ entidade: 'usuario', acao: 'SENHA_ALTERADA', entidadeDoAtor: true })
  @Patch('senha')
  async alterarSenha(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: AlterarSenhaDto) {
    await this.auth.alterarSenha(usuario.id, dto);
  }
}
