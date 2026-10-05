import { HttpErrorResponse } from '@angular/common/http';
import { ErroApi } from './modelos';

// Extrai uma mensagem legível de qualquer erro de requisição.
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof HttpErrorResponse) {
    if (erro.status === 0) return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
    const mensagem = (erro.error as Partial<ErroApi> | null)?.mensagem;
    if (Array.isArray(mensagem)) return mensagem.join(' ');
    if (mensagem) return mensagem;
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
