import { Component, HostListener, inject, signal } from '@angular/core';
import { AcessibilidadeService, Tema, ZOOM_MAX, ZOOM_MIN } from '../core/acessibilidade.service';
import { Icone } from './icone';

@Component({
  selector: 'app-acessibilidade',
  imports: [Icone],
  templateUrl: './acessibilidade.html',
  styleUrl: './acessibilidade.scss',
})
export class Acessibilidade {
  protected readonly servico = inject(AcessibilidadeService);
  protected readonly aberto = signal(false);
  protected readonly ZOOM_MIN = ZOOM_MIN;
  protected readonly ZOOM_MAX = ZOOM_MAX;

  protected readonly temas: { valor: Tema; rotulo: string }[] = [
    { valor: 'auto', rotulo: 'Automático' },
    { valor: 'claro', rotulo: 'Claro' },
    { valor: 'escuro', rotulo: 'Escuro' },
  ];

  protected get prefs() {
    return this.servico.prefs();
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc() {
    this.aberto.set(false);
  }
}
