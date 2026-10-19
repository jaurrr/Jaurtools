import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-gyroscope-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './gyroscope-test.component.html',
  styleUrl: './gyroscope-test.component.scss',
})
export class GyroscopeTestComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt(this.alpha(), '°'));
  copyMain(): void {
    const text = this.copyText();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'gyroscope-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['device-test', 'vibration-test', 'touchscreen-test', 'what-is-my-browser'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly alpha = signal<number | null>(null);
  readonly beta = signal<number | null>(null);
  readonly gamma = signal<number | null>(null);
  readonly accX = signal<number | null>(null);
  readonly accY = signal<number | null>(null);
  readonly accZ = signal<number | null>(null);
  readonly listening = signal(false);
  readonly permissionState = signal<'unknown' | 'needed' | 'denied' | 'granted'>('unknown');

  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha !== null) this.alpha.set(Math.round(e.alpha * 10) / 10);
    if (e.beta !== null) this.beta.set(Math.round(e.beta * 10) / 10);
    if (e.gamma !== null) this.gamma.set(Math.round(e.gamma * 10) / 10);
  };
  private readonly onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (g) {
      if (g.x !== null && g.x !== undefined) this.accX.set(Math.round(g.x * 100) / 100);
      if (g.y !== null && g.y !== undefined) this.accY.set(Math.round(g.y * 100) / 100);
      if (g.z !== null && g.z !== undefined) this.accZ.set(Math.round(g.z * 100) / 100);
    }
  };

  constructor() {
    const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof doe.requestPermission === 'function') {
      this.permissionState.set('needed');
    } else if ('DeviceOrientationEvent' in window) {
      this.startListening();
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly supported = computed(() => 'DeviceOrientationEvent' in window);

  readonly dotX = computed(() => {
    const g = this.gamma();
    if (g === null) return 50;
    return Math.min(96, Math.max(4, 50 + (g / 90) * 50));
  });
  readonly dotY = computed(() => {
    const b = this.beta();
    if (b === null) return 50;
    return Math.min(96, Math.max(4, 50 + (b / 90) * 50));
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }
  list(key: string): string[] {
    this.translate.lang();
    const raw = this.lookup(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }
  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  fmt(v: number | null, unit: string): string {
    return v === null ? '—' : v + unit;
  }

  async requestPermission() {
    const doe = DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> };
    try {
      const res = await doe.requestPermission();
      if (res === 'granted') {
        this.permissionState.set('granted');
        this.startListening();
      } else {
        this.permissionState.set('denied');
      }
    } catch {
      this.permissionState.set('denied');
    }
  }

  private startListening() {
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
    this.listening.set(true);
  }

  private stopListening() {
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    this.listening.set(false);
  }

  ngOnDestroy() {
    this.stopListening();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private updateSeo() {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }
  private setLink(rel: string, href: string, hreflang?: string) {
    const head = this.document.head;
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
    let el = head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = this.document.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      head.appendChild(el);
    }
    el.href = href;
  }
  private refreshJsonLd() {
    this.jsonLdEl?.remove();
    const mainEntity = this.faqs().map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity,
    }).replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
