import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

// Versão do texto abaixo. Mantenha igual a POLITICA_VERSAO do backend (backend/src/common/politica.ts).
export const POLITICA_VERSAO = '0.1-modelo';

// Política de Privacidade. É um MODELO TÉCNICO: descreve com precisão o que o sistema faz hoje com os dados, mas os
// trechos marcados como "a definir" (controlador, encarregado, bases legais, prazos) dependem de orientação jurídica.
@Component({
  selector: 'app-privacidade',
  imports: [RouterLink],
  templateUrl: './privacidade.html',
  styleUrl: './privacidade.scss',
})
export class Privacidade {
  protected readonly versao = POLITICA_VERSAO;
  private readonly local = inject(Location);

  protected volta() {
    this.local.back();
  }
}
