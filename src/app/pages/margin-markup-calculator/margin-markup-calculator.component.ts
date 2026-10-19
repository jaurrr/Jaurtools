import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type MmMode = 'cost-price' | 'cost-margin' | 'price-markup';

interface MmResult {
  valid: boolean;
  cost: number;
  price: number;
  profit: number;
  margin: number;
  markup: number;
}

@Component({
  selector: 'app-margin-markup-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './margin-markup-calculator.component.html',
  styleUrl: './margin-markup-calculator.component.scss',
})
export class MarginMarkupCalculatorComponent implements OnDestroy {
  readonly slug = 'margin-markup-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['margin-calculator', 'percentage-calculator', 'money-counter', 'invoice-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<MmMode>('cost-price');
  readonly a = signal(60);
  readonly b = signal(100);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly fieldALabel = computed(() =>
    this.mode() === 'price-markup' ? this.t('labels.priceLabel') : this.t('labels.costLabel')
  );

  readonly fieldBLabel = computed(() => {
    const m = this.mode();
    if (m === 'cost-margin') return this.t('labels.marginInputLabel');
    if (m === 'price-markup') return this.t('labels.markupInputLabel');
    return this.t('labels.priceLabel');
  });

  readonly result = computed<MmResult>(() => {
    const m = this.mode();
    const a = this.a();
    const b = this.b();
    if (m === 'cost-price') {
      const cost = a;
      const price = b;
      const profit = price - cost;
      return {
        valid: true,
        cost,
        price,
        profit,
        margin: price !== 0 ? (profit / price) * 100 : 0,
        markup: cost !== 0 ? (profit / cost) * 100 : 0,
      };
    }
    if (m === 'cost-margin') {
      const cost = a;
      const margin = b;
      if (margin >= 100) {
        return { valid: false, cost: 0, price: 0, profit: 0, margin: 0, markup: 0 };
      }
      const price = cost / (1 - margin / 100);
      const profit = price - cost;
      return {
        valid: true,
        cost,
        price,
        profit,
        margin,
        markup: cost !== 0 ? (profit / cost) * 100 : 0,
      };
    }
    const price = a;
    const markup = b;
    const cost = price / (1 + markup / 100);
    const profit = price - cost;
    return {
      valid: true,
      cost,
      price,
      profit,
      margin: price !== 0 ? (profit / price) * 100 : 0,
      markup,
    };
  });

  readonly pctFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
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

  setMode(m: MmMode) {
    this.mode.set(m);
  }
  setA(v: number) {
    this.a.set(this.clampNum(v, 0, 100000000));
  }
  setB(v: number) {
    this.b.set(this.clampNum(v, -100, 10000));
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
