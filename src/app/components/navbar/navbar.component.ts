import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { TranslateService, type Lang } from '../../core/translate.service';
import { IconComponent } from '../icon/icon.component';

interface LangOption {
  code: Lang;
  key: string;
}

const LANGS: LangOption[] = [
  { code: 'en', key: 'nav.language_en' },
  { code: 'hi', key: 'nav.language_hi' },
  { code: 'ar', key: 'nav.language_ar' },
];

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly langs = LANGS;
  readonly menuOpen = signal(false);
  readonly langOpen = signal(false);
  readonly scrolled = signal(false);

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scrolled.set(window.scrollY > 8);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const el = event.target as HTMLElement | null;
    if (!el?.closest?.('.lang-dropdown')) this.langOpen.set(false);
    if (!el?.closest?.('.navbar')) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.langOpen.set(false);
    this.menuOpen.set(false);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleLang(): void {
    this.langOpen.update((open) => !open);
  }

  closeLang(): void {
    this.langOpen.set(false);
  }

  switchLang(next: Lang): void {
    if (next === this.translate.lang()) return;
    this.translate.setLang(next);
    this.closeMenu();
    this.closeLang();
    const [path, qs] = this.router.url.split('?');
    const segs = path.split('/').filter(Boolean);
    if (segs.length > 0 && (segs[0] === 'en' || segs[0] === 'hi' || segs[0] === 'ar')) {
      segs[0] = next;
    } else {
      segs.unshift(next);
    }
    this.router.navigateByUrl(`/${segs.join('/')}${qs ? `?${qs}` : ''}`);
  }
}
