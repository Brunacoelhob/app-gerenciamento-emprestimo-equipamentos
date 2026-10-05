import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

// Rótulo em português para cada status HTTP que a API usa.
const ROTULOS_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida',
  [HttpStatus.UNAUTHORIZED]: 'Não autenticado',
  [HttpStatus.FORBIDDEN]: 'Sem permissão',
  [HttpStatus.NOT_FOUND]: 'Não encontrado',
  [HttpStatus.CONFLICT]: 'Conflito',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Corpo grande demais',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Não processável',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisições',
};

// Padroniza TODA resposta de erro num formato único, em português, venha de onde vier:
// validação, guard, regra de negócio ou falha inesperada (banco fora do ar, bug...).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Erros');

  catch(excecao: unknown, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();
    const requisicao = contexto.getRequest<Request>();

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const corpo = excecao.getResponse();
      const mensagem =
        Number(status) === Number(HttpStatus.TOO_MANY_REQUESTS)
          ? 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.'
          : typeof corpo === 'string'
            ? corpo
            : ((corpo as { message?: string | string[] }).message ?? 'Erro inesperado.');

      resposta.status(status).json({
        statusCode: status,
        erro: ROTULOS_STATUS[status] ?? 'Erro',
        mensagem,
        caminho: requisicao.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Erro não previsto: registra o detalhe no log (com a pilha) mas NÃO o devolve ao cliente.
    this.log.error(
      `${requisicao.method} ${requisicao.url}`,
      excecao instanceof Error ? excecao.stack : String(excecao),
    );
    resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      erro: 'Erro interno',
      mensagem: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      caminho: requisicao.url,
      timestamp: new Date().toISOString(),
    });
  }
}
