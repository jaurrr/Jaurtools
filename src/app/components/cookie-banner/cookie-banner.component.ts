import { Component, inject, OnDestroy, signal } from '@angular/core';

import { TranslateService } from '../../core/translate.service';

const CONSENT_KEY = 'jt-consent';

interface Consent {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  savedAt: string;
}

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [],
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.scss',
})
export class CookieBannerComponent implements OnDestroy {
  readonly translate = inject(TranslateService);

  readonly visible = signal(false);
  readonly customizing = signal(false);
  readonly preferences = signal(false);
  readonly analytics = signal(false);

  private readonly reopen = () => {
    this.customizing.set(true);
    this.visible.set(true);
  };

  constructor() {
    if (!this.hasConsent()) this.visible.set(true);
    window.addEventListener('jt:open-cookies', this.reopen);
  }

  ngOnDestroy(): void {
    window.removeEventListener('jt:open-cookies', this.reopen);
  }

  acceptAll(): void {
    this.preferences.set(true);
    this.analytics.set(true);
    this.persist(true, true);
  }

  rejectAll(): void {
    this.preferences.set(false);
    this.analytics.set(false);
    this.persist(false, false);
  }

  saveChoices(): void {
    this.persist(this.preferences(), this.analytics());
  }

  private hasConsent(): boolean {
    try {
      return localStorage.getItem(CONSENT_KEY) !== null;
    } catch {
      return true;
    }
  }

  private persist(preferences: boolean, analytics: boolean): void {
    const consent: Consent = { necessary: true, preferences, analytics, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // Storage unavailable — just dismiss the banner.
    }
    this.visible.set(false);
    this.customizing.set(false);
  }
}
