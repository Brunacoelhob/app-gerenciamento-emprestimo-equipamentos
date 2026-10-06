import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { CriarReservaDto } from './dto/criar-reserva.dto';
import { ReservasService } from './reservas.service';

@ApiTags('Fila de espera')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @ApiOperation({
    summary: 'Entra na fila de espera de um equipamento emprestado',
    description:
      'Só vale para equipamento ativo e emprestado a outra pessoa. Quando ele for devolvido, quem espera há mais tempo recebe um e-mail.',
  })
  @ApiCreatedResponse({ description: 'A reserva, com a posição na fila.' })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @ApiConflictResponse({ description: 'Equipamento disponível, fora de uso, já com você, ou você já está na fila.' })
  @Post()
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarReservaDto) {
    return this.reservas.criar(usuario, dto);
  }

  @ApiOperation({ summary: 'Lista as SUAS filas de espera, com a posição em cada uma' })
  @ApiOkResponse({ description: 'As filas em que você está, da mais antiga para a mais nova.' })
  @Get('minhas')
  minhas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.reservas.minhas(usuario.id);
  }

  @ApiOperation({ summary: 'Sai de uma fila de espera (a própria pessoa ou um ADMIN)' })
  @ApiNoContentResponse({ description: 'Você saiu da fila.' })
  @ApiForbiddenResponse({ description: 'A reserva é de outra pessoa.' })
  @ApiNotFoundResponse({ description: 'Reserva não encontrada.' })
  @ApiConflictResponse({ description: 'A reserva já não estava na fila.' })
  @HttpCode(204)
  @Delete(':id')
  async cancelar(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    await this.reservas.cancelar(usuario, id);
  }
}
