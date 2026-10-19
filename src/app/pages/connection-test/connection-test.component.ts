import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLES = 5;

@Component({
  selector: 'app-connection-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './connection-test.component.html',
  styleUrl: './connection-test.component.scss',
})
export class ConnectionTestComponent implements OnDestroy {
  readonly slug = 'connection-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['device-test', 'what-is-my-browser', 'webcam-test', 'mic-test'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly pingSamples = signal<number[]>([]);
  readonly pingRunning = signal(false);
  readonly pingFailed = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly onOnline = () => this.online.set(true);
  private readonly onOffline = () => this.online.set(false);

  constructor() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly connInfo = computed(() => {
    this.translate.lang();
    const c = (navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    }).connection;
    return {
      effectiveType: c?.effectiveType ?? '',
      downlink: c?.downlink ?? null,
      rtt: c?.rtt ?? null,
      saveData: c?.saveData ?? null,
    };
  });

  readonly avgPing = computed(() => {
    const s = this.pingSamples();
    if (!s.length) return 0;
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  readonly minPing = computed(() => {
    const s = this.pingSamples();
    return s.length ? Math.min(...s) : 0;
  });
  readonly maxPing = computed(() => {
    const s = this.pingSamples();
    return s.length ? Math.max(...s) : 0;
  });
  readonly jitter = computed(() => {
    const s = this.pingSamples();
    if (s.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < s.length; i++) sum += Math.abs(s[i] - s[i - 1]);
    return sum / (s.length - 1);
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

  async runPing() {
    if (this.pingRunning()) return;
    this.pingRunning.set(true);
    this.pingFailed.set(false);
    this.pingSamples.set([]);
    for (let i = 0; i < SAMPLES; i++) {
      try {
        const url = window.location.origin + '/?_ping=' + Date.now();
        const t0 = performance.now();
        await fetch(url, { cache: 'no-store', mode: 'no-cors' });
        const ms = Math.round((performance.now() - t0) * 10) / 10;
        this.pingSamples.set([...this.pingSamples(), ms]);
      } catch {
        this.pingFailed.set(true);
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    this.pingRunning.set(false);
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
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
