import { Component, inject } from '@angular/core';
import { AcessibilidadeService, ZOOM_MAX, ZOOM_MIN } from '../core/acessibilidade.service';
import { Icone } from './icone';

// Barra de acessibilidade no topo de todas as telas: um botão ao lado do outro, cada um com texto e estado
// (aria-pressed) para leitores de tela.
@Component({
  selector: 'app-acessibilidade',
  imports: [Icone],
  templateUrl: './acessibilidade.html',
  styleUrl: './acessibilidade.scss',
})
export class Acessibilidade {
  protected readonly servico = inject(AcessibilidadeService);
  protected readonly ZOOM_MIN = ZOOM_MIN;
  protected readonly ZOOM_MAX = ZOOM_MAX;

  protected get prefs() {
    return this.servico.prefs();
  }
}
