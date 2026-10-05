import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { PrivacidadeService } from './privacidade.service';

class ConfirmarSenhaDto {
  @ApiProperty({ description: 'A senha atual, para confirmar que é você.', example: 'Senha1234' })
  @IsString({ message: 'A senha deve ser um texto.' })
  @MinLength(1, { message: 'Informe a senha.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  senha: string;
}

@ApiTags('Privacidade (LGPD)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@Controller('auth')
export class PrivacidadeController {
  constructor(private readonly privacidade: PrivacidadeService) {}

  @ApiOperation({
    summary: 'Baixa todos os SEUS dados (perfil, empréstimos e ações registradas) em JSON',
    description: 'Direito de acesso e portabilidade. A senha não é exportada.',
  })
  @ApiOkResponse({ description: 'Arquivo JSON com os dados da pessoa autenticada.' })
  @Header('Content-Disposition', 'attachment; filename="meus-dados.json"')
  @Header('Cache-Control', 'no-store')
  @Get('eu/dados')
  dados(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.privacidade.exportar(usuario.id);
  }

  @ApiOperation({
    summary: 'Exclui a SUA conta (anonimização). Exige a senha',
    description:
      'Apaga tudo que identifica a pessoa (nome, e-mail, CPF, telefone, endereço, avatar) e encerra as sessões. O histórico de empréstimos continua, como "Usuário removido". Não é possível enquanto houver equipamentos emprestados nem para o último administrador ativo. Não tem volta.',
  })
  @ApiNoContentResponse({ description: 'Conta anonimizada. A sessão atual deixa de valer.' })
  @ApiUnprocessableEntityResponse({ description: 'Senha incorreta.' })
  @ApiConflictResponse({ description: 'Há equipamentos emprestados, ou é o último administrador ativo.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas por minuto.' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('eu/anonimizar')
  async anonimizar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: ConfirmarSenhaDto) {
    await this.privacidade.anonimizar(usuario.id, dto.senha);
  }
}
