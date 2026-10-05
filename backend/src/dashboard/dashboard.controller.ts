import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { DashboardService } from './dashboard.service';
import { ConsultarDashboardDto } from './dto/consultar-dashboard.dto';
import { DashboardRespostaDto } from './dto/dashboard-resposta.dto';

@ApiTags('Painel')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @ApiOperation({
    summary: 'Métricas do painel: indicadores, série diária, rankings e atrasos',
    description:
      'ADMIN recebe o panorama do sistema todo (`escopo: geral`). Os demais recebem só os próprios empréstimos (`escopo: pessoal`); o estado do acervo (disponíveis, emprestados) é igual para todos.',
  })
  @ApiOkResponse({ type: DashboardRespostaDto })
  @ApiBadRequestResponse({ description: 'Período inválido (use de 7 a 90 dias).' })
  @Get('resumo')
  resumo(@CurrentUser() usuario: UsuarioAutenticado, @Query() dto: ConsultarDashboardDto) {
    return this.dashboard.resumo(usuario, dto.dias);
  }
}
