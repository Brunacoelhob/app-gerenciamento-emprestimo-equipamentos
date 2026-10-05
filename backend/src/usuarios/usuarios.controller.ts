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
import { Auditar } from '../auditoria/auditar.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { ListarUsuariosDto } from './dto/listar-usuarios.dto';
import { UsuarioRespostaDto } from './dto/usuario-resposta.dto';
import { UsuariosService } from './usuarios.service';

// Todas as rotas daqui são exclusivas de ADMIN (única forma de criar outro administrador).
@ApiTags('Usuários (admin)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
@Roles(Role.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @ApiOperation({ summary: 'Lista os usuários (paginado, com filtros por papel e situação)' })
  @ApiOkResponse({ description: 'Página de usuários.' })
  @Get()
  listar(@Query() dto: ListarUsuariosDto) {
    return this.usuarios.listar(dto);
  }

  @ApiOperation({ summary: 'Cria um usuário, inclusive outro ADMIN' })
  @ApiCreatedResponse({ type: UsuarioRespostaDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos (senha fraca, e-mail inválido...).' })
  @ApiConflictResponse({ description: 'Já existe um usuário com esse e-mail.' })
  @Auditar<UsuarioRespostaDto>({
    entidade: 'usuario',
    acao: 'USUARIO_CRIADO',
    detalhes: (_c, r) => ({ email: r?.email, role: r?.role }),
  })
  @Post()
  criar(@Body() dto: CriarUsuarioDto) {
    return this.usuarios.criar(dto);
  }

  @ApiOperation({ summary: 'Detalha um usuário' })
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado.' })
  @Get(':id')
  obter(@Param('id', ParseIntPipe) id: number) {
    return this.usuarios.obter(id);
  }

  @ApiOperation({
    summary: 'Altera o papel e/ou ativa e desativa uma conta',
    description:
      'Desativar (ou rebaixar) encerra as sessões da pessoa na hora. Não é possível alterar a própria conta nem remover o último administrador ativo.',
  })
  @ApiOkResponse({ type: UsuarioRespostaDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado.' })
  @ApiConflictResponse({ description: 'Seria removido o último administrador ativo.' })
  @Auditar<UsuarioRespostaDto>({
    entidade: 'usuario',
    acao: (c) => [
      ...(c.role !== undefined ? (['PAPEL_ALTERADO'] as const) : []),
      ...(c.ativo === false ? (['CONTA_DESATIVADA'] as const) : []),
      ...(c.ativo === true ? (['CONTA_REATIVADA'] as const) : []),
    ],
    detalhes: (c) => ({ role: c.role, ativo: c.ativo }),
  })
  @Patch(':id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarUsuarioDto,
    @CurrentUser() admin: UsuarioAutenticado,
  ) {
    return this.usuarios.atualizar(id, dto, admin.id);
  }
}
