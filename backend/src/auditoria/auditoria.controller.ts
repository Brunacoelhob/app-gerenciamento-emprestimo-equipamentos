import { Controller, Get, Query } from '@nestjs/common';
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
import { AuditoriaService } from './auditoria.service';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

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
      'Registra criação e mudança de contas e papéis, edição do acervo, trocas de senha e sessões suspeitas.',
  })
  @ApiOkResponse({ description: 'Página de registros.' })
  @Get()
  listar(@Query() dto: ListarAuditoriaDto) {
    return this.auditoria.listar(dto);
  }
}
