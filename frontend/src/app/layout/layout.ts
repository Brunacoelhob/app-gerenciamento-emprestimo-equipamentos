import { Location } from '@angular/common';
import { Component, computed, HostListener, inject, signal } from '@angular/core';
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

  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly url = signal(this.router.url);
  // O dashboard é a raiz: não há para onde voltar
  protected readonly mostrarVoltar = computed(() => this.url().split('?')[0] !== '/');

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.menuAberto.set(false);
      this.url.set(this.router.url);
    });
  }

  // Volta à página anterior do app. Se a pessoa abriu esta página direto (sem histórico), vai para o dashboard.
  protected voltar() {
    const navegacoes = (history.state as { navigationId?: number } | null)?.navigationId ?? 1;
    if (navegacoes > 1) this.location.back();
    else void this.router.navigate(['/']);
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc() {
    this.menuAberto.set(false);
  }
}
