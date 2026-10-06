import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { AuditoriaService } from './auditoria.service';
import { ListarAuditoriaDto, RelatorioAuditoriaDto } from './dto/listar-auditoria.dto';

@ApiTags('Auditoria (admin)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
@Roles(Role.ADMIN)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @ApiOperation({
    summary: 'Trilha de auditoria: quem fez o quê e quando (do mais recente para o mais antigo)',
    description:
      'Registra criação e mudança de contas e papéis, edição do acervo, trocas de senha, sessões suspeitas e exportações. Cada item traz o texto da ação, a categoria e os detalhes já em linguagem legível.',
  })
  @ApiOkResponse({ description: 'Página de registros.' })
  @Get()
  listar(@Query() dto: ListarAuditoriaDto) {
    return this.auditoria.listar(dto);
  }

  @ApiOperation({ summary: 'As ações que existem, com texto e categoria (para montar o filtro)' })
  @ApiOkResponse({ description: 'Lista de { valor, rotulo, categoria, critica }.' })
  @Get('acoes')
  acoes() {
    return this.auditoria.acoes();
  }

  @ApiOperation({
    summary: 'Baixa o relatório da auditoria em PDF, Excel (xlsx) ou CSV',
    description:
      'Respeita os mesmos filtros da listagem e traz TODOS os registros que casam (até 5000; acima disso o arquivo avisa que foi cortado), com data e hora em colunas separadas. A exportação também fica registrada na trilha.',
  })
  @ApiProduces('application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')
  @ApiOkResponse({ description: 'O arquivo, como anexo.' })
  @ApiBadRequestResponse({ description: 'Formato inválido (use pdf, xlsx ou csv).' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // relatório é pesado: evita repetição em massa
  @Get('relatorio')
  async relatorio(
    @Query() dto: RelatorioAuditoriaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { formato, ...filtro } = dto;
    const arquivo = await this.auditoria.exportar(filtro, formato, usuario.id);
    const dia = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': arquivo.tipo,
      'Content-Disposition': `attachment; filename="auditoria-${dia}.${arquivo.extensao}"`,
      'Cache-Control': 'no-store',
      'X-Total-Registros': String(arquivo.total),
      'X-Relatorio-Cortado': String(arquivo.cortado),
    });
    return new StreamableFile(arquivo.buffer);
  }
}
