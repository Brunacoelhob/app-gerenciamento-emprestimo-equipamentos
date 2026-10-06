import { Component, input } from '@angular/core';

// Logo do Equipment loan: um notebook cercado pelas setas de empréstimo e devolução.
@Component({
  selector: 'app-logo',
  template: `
    <svg
      [attr.width]="tamanho()"
      [attr.height]="tamanho()"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="#2457c5" />
      <rect
        x="17"
        y="19"
        width="30"
        height="19"
        rx="2.5"
        fill="none"
        stroke="#fff"
        stroke-width="3"
      />
      <path d="M12 43h40" stroke="#fff" stroke-width="3" stroke-linecap="round" />
      <path
        d="M20 12.5a15 15 0 0 1 24 0m0 0-.5-5m.5 5-5 .5"
        fill="none"
        stroke="#ffd23f"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M44 51.5a15 15 0 0 1-24 0m0 0 .5 5m-.5-5 5-.5"
        fill="none"
        stroke="#ffd23f"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  styles: ':host { display: inline-flex; } svg { border-radius: 8px; }',
})
export class Logo {
  readonly tamanho = input(32);
}
