import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Publica } from '../common/decorators/publica.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { UsuarioRespostaDto } from '../usuarios/dto/usuario-resposta.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import { RenovarSessaoDto } from './dto/renovar-sessao.dto';
import { TokensRespostaDto } from './dto/tokens-resposta.dto';

const UM_MINUTO = 60_000;
const UMA_HORA = 3_600_000;

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly usuarios: UsuariosService,
  ) {}

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
  @Throttle({ default: { limit: 10, ttl: UMA_HORA } }) // cadastro em massa também é abuso
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
  @Throttle({ default: { limit: 5, ttl: UM_MINUTO } }) // freio contra força bruta
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
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
  renovar(@Body() dto: RenovarSessaoDto) {
    return this.auth.renovar(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Sai: invalida o refresh token informado (idempotente)' })
  @ApiNoContentResponse({ description: 'Sessão encerrada (ou já estava encerrada).' })
  @Publica()
  @HttpCode(204)
  @Post('sair')
  async sair(@Body() dto: RenovarSessaoDto) {
    await this.auth.sair(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
  @Get('eu')
  eu(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.usuarios.obter(usuario.id);
  }

  @ApiOperation({ summary: 'Troca a própria senha (encerra todas as sessões)' })
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Senha alterada. É preciso entrar de novo.' })
  @ApiBadRequestResponse({ description: 'Nova senha fraca ou igual à atual.' })
  @ApiUnprocessableEntityResponse({ description: 'A senha atual está incorreta.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas por minuto.' })
  @Throttle({ default: { limit: 5, ttl: UM_MINUTO } })
  @HttpCode(204)
  @Patch('senha')
  async alterarSenha(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: AlterarSenhaDto) {
    await this.auth.alterarSenha(usuario.id, dto);
  }
}
