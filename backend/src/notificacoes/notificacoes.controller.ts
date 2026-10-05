import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { NotificacoesService } from './notificacoes.service';

@ApiTags('Notificações (admin)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
@Roles(Role.ADMIN)
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @ApiOperation({
    summary: 'Roda agora a rotina de avisos por e-mail (lembretes, atrasos e resumo)',
    description:
      'A rotina também roda sozinha todo dia no horário configurado (`NOTIFICACOES_CRON`). Cada empréstimo recebe cada aviso uma única vez (lembrete) ou no máximo a cada 3 dias (atraso): chamar de novo não repete e-mails.',
  })
  @ApiOkResponse({ description: 'Quantos avisos saíram nesta rodada.' })
  @HttpCode(200)
  @Post('executar')
  executar() {
    return this.notificacoes.executar();
  }
}
