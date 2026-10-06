import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
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
import { CriarEmprestimoDto } from './dto/criar-emprestimo.dto';
import { EmprestimoRespostaDto } from './dto/emprestimo-resposta.dto';
import { RenovarEmprestimoDto } from './dto/renovar-emprestimo.dto';
import {
  ListarEmprestimosDto,
  ListarMeusEmprestimosDto,
  RelatorioEmprestimosDto,
  RelatorioMeusEmprestimosDto,
} from './dto/listar-emprestimos.dto';
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
    summary: 'Renova o prazo de um empréstimo (o dono ou um ADMIN)',
    description:
      'Soma `dias` (1 a 14, padrão 7) ao prazo atual. Limite de 2 renovações por empréstimo e só antes do prazo vencer. Operação atômica: renovações simultâneas nunca passam do limite.',
  })
  @ApiOkResponse({ type: EmprestimoRespostaDto })
  @ApiForbiddenResponse({ description: 'O empréstimo é de outra pessoa.' })
  @ApiNotFoundResponse({ description: 'Empréstimo não encontrado.' })
  @ApiConflictResponse({ description: 'Já devolvido, com o prazo vencido ou no limite de renovações.' })
  @Auditar<EmprestimoRespostaDto>({
    entidade: 'emprestimo',
    acao: 'EMPRESTIMO_RENOVADO',
    detalhes: (_c, r) => ({
      equipamento: r?.equipamento?.nome,
      novoPrazo: r?.prazoDevolucao,
      renovacoes: r?.renovacoes,
    }),
  })
  @Patch(':id/renovacao')
  renovar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenovarEmprestimoDto,
  ) {
    return this.emprestimos.renovar(usuario, id, dto);
  }

  @ApiOperation({ summary: 'Baixa o relatório dos SEUS empréstimos (pdf, xlsx ou csv)' })
  @ApiOkResponse({ description: 'O arquivo, como anexo.' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('meus/relatorio')
  async relatorioMeus(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: RelatorioMeusEmprestimosDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { total, cortado, arquivo } = await this.emprestimos.exportar(
      dto.formato,
      { usuarioId: usuario.id, status: dto.status, atrasados: dto.atrasados, busca: dto.busca },
      'Meus empréstimos',
    );
    return this.anexo(res, 'meus-emprestimos', arquivo, total, cortado);
  }

  @ApiOperation({ summary: 'Baixa o relatório de TODOS os empréstimos (somente ADMIN)' })
  @ApiOkResponse({ description: 'O arquivo, como anexo.' })
  @ApiForbiddenResponse({ description: 'O usuário autenticado não é ADMIN.' })
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('relatorio')
  async relatorioTodos(@Query() dto: RelatorioEmprestimosDto, @Res({ passthrough: true }) res: Response) {
    const { total, cortado, arquivo } = await this.emprestimos.exportar(
      dto.formato,
      {
        usuarioId: dto.usuarioId,
        equipamentoId: dto.equipamentoId,
        status: dto.status,
        atrasados: dto.atrasados,
        busca: dto.busca,
        buscarPessoa: true,
      },
      'Relatório de empréstimos',
    );
    return this.anexo(res, 'emprestimos', arquivo, total, cortado);
  }

  private anexo(
    res: Response,
    nome: string,
    arquivo: { buffer: Buffer; tipo: string; extensao: string },
    total: number,
    cortado: boolean,
  ) {
    const dia = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': arquivo.tipo,
      'Content-Disposition': `attachment; filename="${nome}-${dia}.${arquivo.extensao}"`,
      'Cache-Control': 'no-store',
      'X-Total-Registros': String(total),
      'X-Relatorio-Cortado': String(cortado),
    });
    return new StreamableFile(arquivo.buffer);
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
  // Só vira registro quando um ADMIN devolve o empréstimo de OUTRA pessoa (a devolução normal é o fluxo do dia a dia)
  @Auditar<EmprestimoRespostaDto>({
    entidade: 'emprestimo',
    acao: (_c, r, ator) => (r?.usuario?.id !== ator.id ? 'DEVOLUCAO_POR_ADMIN' : null),
    detalhes: (_c, r) => ({ equipamento: r?.equipamento?.nome, pessoaId: r?.usuario?.id }),
  })
  @Patch(':id/devolucao')
  devolver(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.emprestimos.devolver(usuario, id);
  }
}
