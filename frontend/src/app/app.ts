import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvisoCookies } from './compartilhado/aviso-cookies';
import { Rodape } from './compartilhado/rodape';
import { Acessibilidade } from './compartilhado/acessibilidade';
import { AcessibilidadeService } from './core/acessibilidade.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Acessibilidade, Rodape, AvisoCookies],
  template: `
    <app-acessibilidade />
    <router-outlet />
    <app-rodape />
    <app-aviso-cookies />
  `,
})
export class App {
  // Só instanciar o serviço já aplica as preferências salvas (tema, tamanho do texto, etc.) em todas as telas
  private readonly acessibilidade = inject(AcessibilidadeService);
}
