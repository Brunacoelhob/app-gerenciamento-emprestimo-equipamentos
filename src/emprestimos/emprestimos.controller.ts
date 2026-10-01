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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { CriarEmprestimoDto } from './dto/criar-emprestimo.dto';
import { EmprestimoRespostaDto } from './dto/emprestimo-resposta.dto';
import { ListarEmprestimosDto, ListarMeusEmprestimosDto } from './dto/listar-emprestimos.dto';
import { EmprestimosService } from './emprestimos.service';

@ApiTags('Empréstimos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado.' })
@Controller('emprestimos')
export class EmprestimosController {
  constructor(private readonly emprestimos: EmprestimosService) {}

  @ApiOperation({
    summary: 'Retira um equipamento (cria o empréstimo)',
    description:
      'Operação atômica: dois pedidos pelo mesmo equipamento nunca dão certo ao mesmo tempo, o segundo recebe 409. `dias` é o prazo (1 a 30, padrão 7).',
  })
  @ApiCreatedResponse({ type: EmprestimoRespostaDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos.' })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado.' })
  @ApiConflictResponse({ description: 'Equipamento fora de uso ou já emprestado.' })
  @Post()
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarEmprestimoDto) {
    return this.emprestimos.criar(usuario.id, dto);
  }

  @ApiOperation({ summary: 'Lista os SEUS empréstimos (paginado; filtros status e atrasados)' })
  @ApiOkResponse({ description: 'Página de empréstimos, do mais recente para o mais antigo.' })
  @Get('meus')
  listarMeus(@CurrentUser() usuario: UsuarioAutenticado, @Query() dto: ListarMeusEmprestimosDto) {
    return this.emprestimos.listarMeus(usuario.id, dto);
  }

  @ApiOperation({
    summary: 'Lista TODOS os empréstimos (somente ADMIN)',
    description: 'Filtros: `usuarioId`, `equipamentoId` (histórico de um equipamento), `status` e `atrasados`.',
  })
  @ApiOkResponse({ description: 'Página de empréstimos.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @Roles(Role.ADMIN)
  @Get()
  listarTodos(@Query() dto: ListarEmprestimosDto) {
    return this.emprestimos.listarTodos(dto);
  }

  @ApiOperation({
    summary: 'Devolve um empréstimo (o dono ou um ADMIN)',
    description:
      'Operação atômica: devoluções simultâneas do mesmo empréstimo não duplicam; só a primeira vence e as outras recebem 409.',
  })
  @ApiOkResponse({ type: EmprestimoRespostaDto })
  @ApiForbiddenResponse({ description: 'O empréstimo é de outra pessoa.' })
  @ApiNotFoundResponse({ description: 'Empréstimo não encontrado.' })
  @ApiConflictResponse({ description: 'O empréstimo já foi devolvido.' })
  @Patch(':id/devolucao')
  devolver(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.emprestimos.devolver(usuario, id);
  }
}
