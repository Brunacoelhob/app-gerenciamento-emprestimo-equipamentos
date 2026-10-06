import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Publica } from '../common/decorators/publica.decorator';
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
import { Auditar } from '../auditoria/auditar.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AtualizarEquipamentoDto } from './dto/atualizar-equipamento.dto';
import { CriarEquipamentoDto } from './dto/criar-equipamento.dto';
import { EquipamentoRespostaDto } from './dto/equipamento-resposta.dto';
import { ListarEquipamentosDto, RelatorioEquipamentosDto } from './dto/listar-equipamentos.dto';
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
  @Auditar<EquipamentoRespostaDto>({
    entidade: 'equipamento',
    acao: 'EQUIPAMENTO_CRIADO',
    detalhes: (_c, r) => ({ nome: r?.nome }),
  })
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

  @ApiOperation({ summary: 'Baixa o relatório do acervo (pdf, xlsx ou csv; somente ADMIN)' })
  @ApiOkResponse({ description: 'O arquivo, como anexo.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('relatorio')
  async relatorio(@Query() dto: RelatorioEquipamentosDto, @Res({ passthrough: true }) res: Response) {
    const { arquivo, total, cortado } = await this.equipamentos.exportar(dto, dto.formato);
    const dia = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': arquivo.tipo,
      'Content-Disposition': `attachment; filename="equipamentos-${dia}.${arquivo.extensao}"`,
      'Cache-Control': 'no-store',
      'X-Total-Registros': String(total),
      'X-Relatorio-Cortado': String(cortado),
    });
    return new StreamableFile(arquivo.buffer);
  }

  @ApiOperation({
    summary: 'Foto do equipamento (pública, pelo código aleatório)',
    description:
      'Pública de propósito: o navegador carrega <img> sem enviar o token. O código tem 12 caracteres aleatórios, não dá para adivinhá-lo, e a imagem é só a foto do objeto.',
  })
  @ApiOkResponse({ description: 'A imagem (PNG, JPEG ou WEBP).' })
  @ApiNotFoundResponse({ description: 'Equipamento sem foto.' })
  @Publica()
  @SkipThrottle()
  @Get('foto/:codigo')
  async foto(@Param('codigo') codigo: string, @Res({ passthrough: true }) res: Response) {
    const foto = await this.equipamentos.foto(codigo.toUpperCase());
    res.set({
      'Content-Type': foto.tipo,
      // A URL leva a versão (?v=): trocar a foto muda a URL, então o navegador pode guardar por muito tempo
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    });
    return new StreamableFile(Buffer.from(foto.dados));
  }

  @ApiOperation({
    summary: 'Envia ou troca a foto do equipamento (somente ADMIN)',
    description:
      'O corpo é a própria imagem, com Content-Type image/png, image/jpeg ou image/webp (até 400 KB). O conteúdo é conferido pelos bytes.',
  })
  @ApiOkResponse({ type: EquipamentoRespostaDto })
  @ApiBadRequestResponse({ description: 'Imagem inválida, de outro tipo ou grande demais.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @Roles(Role.ADMIN)
  @Auditar<EquipamentoRespostaDto>({
    entidade: 'equipamento',
    acao: 'EQUIPAMENTO_FOTO_ATUALIZADA',
    detalhes: (_c, r) => ({ nome: r?.nome }),
  })
  @Put(':id/foto')
  salvarFoto(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.equipamentos.salvarFoto(id, req.headers['content-type'], req.body);
  }

  @ApiOperation({ summary: 'Remove a foto do equipamento (somente ADMIN)' })
  @ApiOkResponse({ type: EquipamentoRespostaDto })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @Roles(Role.ADMIN)
  @Auditar<EquipamentoRespostaDto>({
    entidade: 'equipamento',
    acao: 'EQUIPAMENTO_FOTO_REMOVIDA',
    detalhes: (_c, r) => ({ nome: r?.nome }),
  })
  @Delete(':id/foto')
  removerFoto(@Param('id', ParseIntPipe) id: number) {
    return this.equipamentos.removerFoto(id);
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
  @Auditar<EquipamentoRespostaDto>({
    entidade: 'equipamento',
    acao: (c) => [
      ...(c.nome !== undefined || c.descricao !== undefined ? (['EQUIPAMENTO_EDITADO'] as const) : []),
      ...(c.ativo === false ? (['EQUIPAMENTO_DESATIVADO'] as const) : []),
      ...(c.ativo === true ? (['EQUIPAMENTO_REATIVADO'] as const) : []),
    ],
    detalhes: (c, r) => ({ nome: r?.nome, ativo: c.ativo }),
  })
  @Patch(':id')
  atualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: AtualizarEquipamentoDto) {
    return this.equipamentos.atualizar(id, dto);
  }
}
