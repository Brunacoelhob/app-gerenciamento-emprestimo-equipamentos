import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { AtualizarEquipamentoDto } from './dto/atualizar-equipamento.dto';
import { CriarEquipamentoDto } from './dto/criar-equipamento.dto';
import { EquipamentoRespostaDto } from './dto/equipamento-resposta.dto';
import { ListarEquipamentosDto } from './dto/listar-equipamentos.dto';
import { EquipamentosService } from './equipamentos.service';

@ApiTags('Equipamentos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@Controller('equipamentos')
export class EquipamentosController {
  constructor(private readonly equipamentos: EquipamentosService) {}

  @ApiOperation({ summary: 'Cadastra um equipamento (somente ADMIN)' })
  @ApiCreatedResponse({ type: EquipamentoRespostaDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @Roles(Role.ADMIN)
  @Post()
  criar(@Body() dto: CriarEquipamentoDto) {
    return this.equipamentos.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os equipamentos (paginado)',
    description:
      'Ordenado por id. Filtros: `ativo`, `emprestado` e `busca` (nome). Devolve `itens` e `meta` com o total.',
  })
  @ApiOkResponse({ description: 'Página de equipamentos.' })
  @Get()
  listar(@Query() dto: ListarEquipamentosDto) {
    return this.equipamentos.listar(dto);
  }

  @ApiOperation({ summary: 'Detalha um equipamento' })
  @ApiOkResponse({ type: EquipamentoRespostaDto })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @Get(':id')
  obter(@Param('id', ParseIntPipe) id: number) {
    return this.equipamentos.obter(id);
  }

  @ApiOperation({
    summary: 'Edita ou tira um equipamento de uso (somente ADMIN)',
    description: 'Para desativar (`ativo: false`) o equipamento não pode estar emprestado.',
  })
  @ApiOkResponse({ type: EquipamentoRespostaDto })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @ApiConflictResponse({ description: 'Equipamento emprestado não pode ser desativado.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  atualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: AtualizarEquipamentoDto) {
    return this.equipamentos.atualizar(id, dto);
  }
}
