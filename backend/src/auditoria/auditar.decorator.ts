import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { AcaoAuditoria, AuditoriaService } from './auditoria.service';

const CHAVE = 'auditar';

export type Corpo = Record<string, unknown>;

export interface OpcoesAuditoria<R = unknown> {
  entidade: 'usuario' | 'equipamento' | 'emprestimo';
  /** Uma ação fixa, ou uma função que decide a(s) ação(ões) a partir do corpo enviado e da resposta (vazio = nada a registrar). */
  acao:
    | AcaoAuditoria
    | ((corpo: Corpo, resposta: R | undefined, ator: UsuarioAutenticado) => AcaoAuditoria | AcaoAuditoria[] | null);
  /** A entidade afetada é a própria pessoa que agiu (ex.: trocar a própria senha). */
  entidadeDoAtor?: boolean;
  /** Dados extras guardados junto (nunca coloque senhas ou tokens aqui). */
  detalhes?: (corpo: Corpo, resposta: R | undefined) => Record<string, unknown> | null;
}

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opcoes = this.reflector.get<OpcoesAuditoria<unknown> | undefined>(CHAVE, contexto.getHandler());
    const requisicao = contexto.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();

    // Só registra DEPOIS de a operação dar certo (um 409 ou 403 não é uma ação que aconteceu)
    return next.handle().pipe(
      tap((resposta: unknown) => {
        if (!opcoes || !requisicao.user) return;
        const corpo = (requisicao.body ?? {}) as Corpo;
        const decidida =
          typeof opcoes.acao === 'function' ? opcoes.acao(corpo, resposta, requisicao.user) : opcoes.acao;
        const acoes = decidida === null ? [] : Array.isArray(decidida) ? decidida : [decidida];
        const idDaRota = Number((requisicao.params as Record<string, string>)['id']);
        for (const acao of acoes) {
          void this.auditoria.registrar({
            atorId: requisicao.user.id,
            acao,
            entidade: opcoes.entidade,
            entidadeId:
              Number.isInteger(idDaRota) && idDaRota > 0
                ? idDaRota
                : ((resposta as { id?: number } | undefined)?.id ??
                  (opcoes.entidadeDoAtor ? requisicao.user.id : null)),
            detalhes: opcoes.detalhes?.(corpo, resposta) ?? null,
          });
        }
      }),
    );
  }
}

/** Registra na trilha de auditoria a ação feita por esta rota (depois que ela der certo). */
export const Auditar = <R = unknown>(opcoes: OpcoesAuditoria<R>) =>
  applyDecorators(SetMetadata(CHAVE, opcoes), UseInterceptors(AuditoriaInterceptor));
