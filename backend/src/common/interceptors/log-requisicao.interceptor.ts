import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// Uma linha de log por requisição: método, rota, status, duração e quem fez (id). Nunca registra corpo,
// cabeçalhos nem tokens, para senhas e credenciais não irem parar nos logs.
@Injectable()
export class LogRequisicaoInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const requisicao = contexto.switchToHttp().getRequest<Request & { user?: { id: number }; idRequisicao?: string }>();
    const resposta = contexto.switchToHttp().getResponse<Response>();
    const inicio = Date.now();

    const registrar = () => {
      const usuario = requisicao.user ? ` usuario=${requisicao.user.id}` : '';
      this.log.log(
        `${requisicao.method} ${requisicao.originalUrl} ${resposta.statusCode} ${Date.now() - inicio}ms${usuario} id=${requisicao.idRequisicao ?? '-'}`,
      );
    };

    // Em caso de erro o status final só é conhecido pelo filtro; aqui o log sai quando a resposta termina.
    resposta.once('finish', registrar);
    return proximo.handle().pipe(tap());
  }
}
