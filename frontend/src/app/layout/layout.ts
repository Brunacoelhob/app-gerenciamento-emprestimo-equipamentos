import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Avatar } from '../compartilhado/avatar';
import { Icone } from '../compartilhado/icone';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone, Avatar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  protected readonly auth = inject(AuthService);
  // Em telas pequenas o menu lateral abre por cima do conteúdo
  protected readonly menuAberto = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuAberto.set(false));
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc() {
    this.menuAberto.set(false);
  }
}
