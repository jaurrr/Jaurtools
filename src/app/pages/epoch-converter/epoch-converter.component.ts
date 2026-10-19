import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-epoch-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './epoch-converter.component.html',
  styleUrl: './epoch-converter.component.scss',
})
export class EpochConverterComponent implements OnDestroy {
  readonly slug = 'epoch-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['base-converter', 'base64-encoder-decoder', 'ascii-table'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'toDate' | 'toEpoch'>('toDate');
  readonly epoch = signal(1700000000);
  readonly unit = signal<'s' | 'ms'>('s');
  readonly autoDetect = signal(true);
  readonly dateInput = signal('2023-11-14T22:13');
  /** Infer the unit from digit count: ≤11 digits = seconds, 12+ = milliseconds. */
  readonly detectedUnit = computed((): 's' | 'ms' => {
    const digits = String(Math.abs(Math.trunc(this.epoch()))).length;
    return digits <= 11 ? 's' : 'ms';
  });
  private readonly ms = computed(() => {
    const e = this.epoch();
    if (!Number.isFinite(e)) return NaN;
    return this.unit() === 's' ? e * 1000 : e;
  });
  readonly utc = computed(() => {
    const m = this.ms();
    return Number.isFinite(m) ? new Date(m).toUTCString() : '';
  });
  readonly local = computed(() => {
    const m = this.ms();
    return Number.isFinite(m)
      ? new Date(m).toLocaleString(this.locale(), { dateStyle: 'full', timeStyle: 'long' })
      : '';
  });
  readonly iso = computed(() => {
    const m = this.ms();
    return Number.isFinite(m) ? new Date(m).toISOString() : '';
  });
  readonly epochOut = computed(() => {
    const t = new Date(this.dateInput()).getTime();
    if (!Number.isFinite(t)) return { s: 0, ms: 0, ok: false };
    return { s: Math.floor(t / 1000), ms: t, ok: true };
  });
  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  setMode(m: 'toDate' | 'toEpoch') { this.mode.set(m); }
  setEpoch(v: number) {
    const n = Number.isFinite(v) ? v : 0;
    this.epoch.set(n);
    if (this.autoDetect()) {
      const digits = String(Math.abs(Math.trunc(n))).length;
      this.unit.set(digits <= 11 ? 's' : 'ms');
    }
  }
  setUnit(u: 's' | 'ms') { this.unit.set(u); this.autoDetect.set(false); }
  toggleAutoDetect() { this.autoDetect.update((v) => !v); }
  setDateInput(v: string) { this.dateInput.set(v); }
  useNow() {
    const now = Date.now();
    if (this.unit() === 's') this.epoch.set(Math.floor(now / 1000));
    else this.epoch.set(now);
  }

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

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
  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }
  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }
  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
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
