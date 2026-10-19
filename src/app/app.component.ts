import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { CookieBannerComponent } from './components/cookie-banner/cookie-banner.component';
import { FooterComponent } from './components/footer/footer.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { toolBySlug } from './core/tools-registry';
import { TranslateService } from './core/translate.service';

const RECENT_STORAGE_KEY = 'jt-recent';
const RECENT_MAX = 12;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, CookieBannerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  constructor() {
    this.translate.init();
    this.trackRecentlyUsedTools();
  }

  private trackRecentlyUsedTools(): void {
    if (typeof window === 'undefined') return;
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const tree = this.router.parseUrl(event.urlAfterRedirects);
        const segments = tree.root.children['primary']?.segments.map((s) => s.path) ?? [];
        if (segments.length !== 2) return;
        const slug = segments[1];
        if (toolBySlug(slug) === undefined) return;
        try {
          const stored: unknown = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]');
          const list: string[] = Array.isArray(stored)
            ? stored.filter((item): item is string => typeof item === 'string')
            : [];
          const next = [slug, ...list.filter((item) => item !== slug)].slice(0, RECENT_MAX);
          localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // storage unavailable — skip tracking
        }
      });
  }
}
