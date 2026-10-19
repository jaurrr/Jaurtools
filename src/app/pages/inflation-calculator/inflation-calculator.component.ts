import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-inflation-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './inflation-calculator.component.html',
  styleUrl: './inflation-calculator.component.scss',
})
export class InflationCalculatorComponent implements OnDestroy {
  readonly slug = 'inflation-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['gdp-calculator', 'future-value-calculator', 'interest-rate-calculator', 'finance-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly amount = signal(100);
  readonly fromYear = signal(2000);
  readonly toYear = signal(2025);

  readonly years = [2000, 2005, 2010, 2015, 2020, 2021, 2022, 2023, 2024, 2025];
  private readonly cpi: Record<number, number> = {
    2000: 172.2, 2005: 195.3, 2010: 218.1, 2015: 237.0, 2020: 258.8,
    2021: 271.0, 2022: 292.7, 2023: 304.7, 2024: 314.0, 2025: 322.0,
  };

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const cpiFrom = this.cpi[this.fromYear()] ?? 172.2;
    const cpiTo = this.cpi[this.toYear()] ?? 322.0;
    const ratio = cpiTo / cpiFrom;
    const adjusted = this.amount() * ratio;
    const cumulative = (ratio - 1) * 100;
    const span = this.toYear() - this.fromYear();
    const annualized = span > 0 ? (Math.pow(ratio, 1 / span) - 1) * 100 : 0;
    return { adjusted, cumulative, annualized, cpiFrom, cpiTo, reversed: span < 0 };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    })
  );

  readonly pct = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
  );

  readonly num = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 })
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

  setAmount(v: number) { this.amount.set(this.clampNum(v, 0, 1000000000)); }
  setFromYear(v: number) { this.fromYear.set(v); }
  setToYear(v: number) { this.toYear.set(v); }

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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
