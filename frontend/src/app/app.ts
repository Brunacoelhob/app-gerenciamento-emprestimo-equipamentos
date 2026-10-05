import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Acessibilidade } from './compartilhado/acessibilidade';
import { AcessibilidadeService } from './core/acessibilidade.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Acessibilidade],
  template: `
    <app-acessibilidade />
    <router-outlet />
  `,
})
export class App {
  // Só instanciar o serviço já aplica as preferências salvas (tema, tamanho do texto, etc.) em todas as telas
  private readonly acessibilidade = inject(AcessibilidadeService);
}
