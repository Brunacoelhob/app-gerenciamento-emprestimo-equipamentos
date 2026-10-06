import { Routes } from '@angular/router';
import { adminGuard, autenticadoGuard, visitanteGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [visitanteGuard],
    loadComponent: () => import('./paginas/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    canActivate: [visitanteGuard],
    loadComponent: () => import('./paginas/registro/registro').then((m) => m.Registro),
  },
  {
    path: 'esqueci-senha',
    canActivate: [visitanteGuard],
    loadComponent: () =>
      import('./paginas/esqueci-senha/esqueci-senha').then((m) => m.EsqueciSenha),
  },
  {
    path: 'redefinir-senha',
    canActivate: [visitanteGuard],
    loadComponent: () =>
      import('./paginas/redefinir-senha/redefinir-senha').then((m) => m.RedefinirSenha),
  },
  {
    path: '',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./paginas/inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'equipamentos',
        loadComponent: () =>
          import('./paginas/equipamentos/equipamentos').then((m) => m.Equipamentos),
      },
      {
        path: 'meus-emprestimos',
        data: { todos: false },
        loadComponent: () => import('./paginas/emprestimos/emprestimos').then((m) => m.Emprestimos),
      },
      {
        path: 'emprestimos',
        canActivate: [adminGuard],
        data: { todos: true },
        loadComponent: () => import('./paginas/emprestimos/emprestimos').then((m) => m.Emprestimos),
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./paginas/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'auditoria',
        canActivate: [adminGuard],
        loadComponent: () => import('./paginas/auditoria/auditoria').then((m) => m.Auditoria),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./paginas/perfil/perfil').then((m) => m.Perfil),
      },
      { path: 'senha', redirectTo: 'perfil' },
    ],
  },
  { path: '**', redirectTo: '' },
];
