import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API, AuthService } from './auth.service';

const comToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

// Rotas de autenticação que nunca recebem token nem disparam renovação
const ROTAS_PUBLICAS = [
  `${API}/auth/login`,
  `${API}/auth/renovar`,
  `${API}/auth/sair`,
  `${API}/auth/registro`,
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API) || ROTAS_PUBLICAS.some((r) => req.url.startsWith(r)))
    return next(req);

  const auth = inject(AuthService);

  return next(comToken(req, auth.token)).pipe(
    catchError((erro: unknown) => {
      if (!(erro instanceof HttpErrorResponse) || erro.status !== 401 || !auth.temSessaoSalva) {
        return throwError(() => erro);
      }
      // Token de acesso expirou: renova uma vez e repete a requisição
      return auth.renovar().pipe(
        switchMap((novoToken) => next(comToken(req, novoToken))),
        catchError((e) => {
          auth.encerrarLocalmente();
          return throwError(() => e);
        }),
      );
    }),
  );
};
