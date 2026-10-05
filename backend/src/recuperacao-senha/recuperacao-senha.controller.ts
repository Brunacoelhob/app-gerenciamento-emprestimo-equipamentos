import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { lerLimite } from '../config/limites';
import { Publica } from '../common/decorators/publica.decorator';
import { EsqueciSenhaDto, RedefinirSenhaDto } from './dto/recuperacao-senha.dto';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

const UMA_HORA = 3_600_000;
// Padrões de produção; as variáveis só devem subir em testes automatizados (veja config/limites.ts)
const LIMITE_PEDIDOS = lerLimite('LIMITE_RECUPERACAO_POR_HORA', 5);
const LIMITE_REDEFINICOES = lerLimite('LIMITE_REDEFINICAO_POR_HORA', 10);

@ApiTags('Recuperação de senha')
@Controller('auth')
export class RecuperacaoSenhaController {
  constructor(private readonly recuperacao: RecuperacaoSenhaService) {}

  @ApiOperation({
    summary: 'Pede o link para redefinir a senha ("esqueci minha senha")',
    description:
      'A resposta é SEMPRE a mesma (204), exista a conta ou não: ninguém descobre quais e-mails estão cadastrados. Se a conta existir e estiver ativa, um e-mail com um link de uso único (30 minutos) é enviado. No máximo 3 pedidos por hora por conta.',
  })
  @ApiNoContentResponse({ description: 'Pedido recebido. Se o e-mail estiver cadastrado, o link foi enviado.' })
  @ApiBadRequestResponse({ description: 'E-mail com formato inválido.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 pedidos por hora neste IP.' })
  @Publica()
  @Throttle({ default: { limit: LIMITE_PEDIDOS, ttl: UMA_HORA } })
  @HttpCode(204)
  @Post('esqueci-senha')
  async esqueciSenha(@Body() dto: EsqueciSenhaDto) {
    await this.recuperacao.solicitar(dto.email);
  }

  @ApiOperation({
    summary: 'Define a nova senha com o código do link recebido por e-mail',
    description: 'O código vale uma vez só. Ao redefinir, TODAS as sessões abertas da conta são encerradas.',
  })
  @ApiNoContentResponse({ description: 'Senha alterada. Entre com a nova senha.' })
  @ApiBadRequestResponse({ description: 'Link inválido, expirado ou já usado; ou senha fraca.' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas por hora neste IP.' })
  @Publica()
  @Throttle({ default: { limit: LIMITE_REDEFINICOES, ttl: UMA_HORA } })
  @HttpCode(204)
  @Post('redefinir-senha')
  async redefinirSenha(@Body() dto: RedefinirSenhaDto) {
    await this.recuperacao.redefinir(dto.token, dto.novaSenha);
  }
}
