import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-future-value-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './future-value-calculator.component.html',
  styleUrl: './future-value-calculator.component.scss',
})
export class FutureValueCalculatorComponent implements OnDestroy {
  readonly slug = 'future-value-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['investment-calculator', 'finance-calculator', 'forex-compounding-calculator', 'interest-rate-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly lumpSum = signal(10000);
  readonly monthlyContrib = signal(200);
  readonly annualRate = signal(7);
  readonly years = signal(10);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const r = this.annualRate() / 100 / 12;
    const n = this.years() * 12;
    const g = r <= 0 ? 1 : Math.pow(1 + r, n);
    const fvLump = this.lumpSum() * g;
    const fvContrib = r <= 0 ? this.monthlyContrib() * n : (this.monthlyContrib() * (g - 1)) / r;
    const fv = fvLump + fvContrib;
    const contributed = this.lumpSum() + this.monthlyContrib() * n;
    return { fvLump, fvContrib, fv, contributed, growth: fv - contributed };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'USD',
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

  setLumpSum(v: number) { this.lumpSum.set(this.clampNum(v, 0, 100000000)); }
  setMonthlyContrib(v: number) { this.monthlyContrib.set(this.clampNum(v, 0, 1000000)); }
  setAnnualRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 50)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 0.5, 100)); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  // Precomputed reference: illustrative future value of monthly investing at the current rate.
  readonly refScenarios = computed(() => {
    const r = this.annualRate() / 1200;
    const f = this.money();
    const amounts = [100, 200, 500];
    const horizons = [10, 15, 20];
    const fv = (m: number, yrs: number) => {
      const n = yrs * 12;
      return r <= 0 ? m * n : (m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r));
    };
    return {
      amounts: amounts.map((a) => f.format(a)),
      horizons,
      cells: amounts.map((a) => horizons.map((yy) => f.format(fv(a, yy)))),
    };
  });

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
