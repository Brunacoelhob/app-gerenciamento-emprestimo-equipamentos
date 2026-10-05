import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

// Libera só quem tem sessão. Ao abrir o app já logado (F5), restaura a sessão a partir do refresh token.
export const autenticadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.autenticado()) return true;
  if (!auth.temSessaoSalva) return router.createUrlTree(['/login']);

  return auth.renovar().pipe(
    switchMap(() => auth.carregarUsuario()),
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};

// Telas de visitante (login): quem já está logado vai para o início.
export const visitanteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? inject(Router).createUrlTree(['/']) : true;
};

// Telas só de administrador (a API também recusa; aqui só evitamos mostrar uma tela que não funcionaria).
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.ehAdmin() ? true : inject(Router).createUrlTree(['/']);
};
