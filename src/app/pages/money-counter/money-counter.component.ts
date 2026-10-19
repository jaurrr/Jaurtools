import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Currency = 'USD' | 'EUR' | 'INR' | 'SAR';

interface Denom {
  value: number;
  label: string;
}

const DENOMS: Record<Currency, Denom[]> = {
  USD: [
    { value: 100, label: '$100' },
    { value: 50, label: '$50' },
    { value: 20, label: '$20' },
    { value: 10, label: '$10' },
    { value: 5, label: '$5' },
    { value: 2, label: '$2' },
    { value: 1, label: '$1' },
    { value: 0.5, label: '50c' },
    { value: 0.25, label: '25c' },
    { value: 0.1, label: '10c' },
    { value: 0.05, label: '5c' },
    { value: 0.01, label: '1c' },
  ],
  EUR: [
    { value: 500, label: '€500' },
    { value: 200, label: '€200' },
    { value: 100, label: '€100' },
    { value: 50, label: '€50' },
    { value: 20, label: '€20' },
    { value: 10, label: '€10' },
    { value: 5, label: '€5' },
    { value: 2, label: '€2' },
    { value: 1, label: '€1' },
    { value: 0.5, label: '50c' },
    { value: 0.2, label: '20c' },
    { value: 0.1, label: '10c' },
    { value: 0.05, label: '5c' },
    { value: 0.02, label: '2c' },
    { value: 0.01, label: '1c' },
  ],
  INR: [
    { value: 500, label: '₹500' },
    { value: 200, label: '₹200' },
    { value: 100, label: '₹100' },
    { value: 50, label: '₹50' },
    { value: 20, label: '₹20' },
    { value: 10, label: '₹10' },
    { value: 5, label: '₹5' },
    { value: 2, label: '₹2' },
    { value: 1, label: '₹1' },
  ],
  SAR: [
    { value: 500, label: 'SR 500' },
    { value: 200, label: 'SR 200' },
    { value: 100, label: 'SR 100' },
    { value: 50, label: 'SR 50' },
    { value: 20, label: 'SR 20' },
    { value: 10, label: 'SR 10' },
    { value: 5, label: 'SR 5' },
    { value: 1, label: 'SR 1' },
    { value: 2, label: 'SR 2 coin' },
    { value: 1, label: 'SR 1 coin' },
    { value: 0.5, label: '50 halala' },
    { value: 0.25, label: '25 halala' },
    { value: 0.1, label: '10 halala' },
    { value: 0.05, label: '5 halala' },
    { value: 0.01, label: '1 halala' },
  ],
};

const SYMBOL: Record<Currency, string> = { USD: '$', EUR: '€', INR: '₹', SAR: 'SR ' };
const CURRENCIES: Currency[] = ['USD', 'EUR', 'INR', 'SAR'];

@Component({
  selector: 'app-money-counter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './money-counter.component.html',
  styleUrl: './money-counter.component.scss',
})
export class MoneyCounterComponent implements OnDestroy {
  readonly slug = 'money-counter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['million-billion-converter', 'invoice-generator', 'margin-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly currency = signal<Currency>('USD');
  readonly counts = signal<Record<Currency, Record<string, number>>>({
    USD: {},
    EUR: {},
    INR: {},
    SAR: {},
  });
  readonly currencies = CURRENCIES;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly symbol = computed(() => SYMBOL[this.currency()]);

  readonly rows = computed(() => {
    const c = this.currency();
    const table = this.counts()[c] ?? {};
    return DENOMS[c].map((d) => {
      const count = table[d.label] ?? 0;
      return { ...d, count, subtotal: d.value * count };
    });
  });

  readonly total = computed(() => this.rows().reduce((s, r) => s + r.subtotal, 0));

  readonly moneyFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );

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

  setCurrency(c: Currency) {
    this.currency.set(c);
  }

  setCount(d: Denom, n: number) {
    const c = this.currency();
    const val = this.clampNum(n, 0, 1000000);
    this.counts.update((all) => ({ ...all, [c]: { ...(all[c] ?? {}), [d.label]: val } }));
  }

  reset() {
    const c = this.currency();
    this.counts.update((all) => ({ ...all, [c]: {} }));
  }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
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
    return Math.min(max, Math.max(min, Math.round(v)));
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
