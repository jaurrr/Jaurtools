import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-real-estate-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './real-estate-calculator.component.html',
  styleUrl: './real-estate-calculator.component.scss',
})
export class RealEstateCalculatorComponent implements OnDestroy {
  readonly slug = 'real-estate-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rental-property-calculator', 'real-estate-investment-calculator', 'price-per-square-foot-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly price = signal(4000000);
  readonly downPct = signal(20);
  readonly annualRate = signal(9);
  readonly years = signal(20);
  readonly rent = signal(38000);
  readonly expenses = signal(6500);

  readonly money0 = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  readonly money2 = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  readonly pct2 = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  readonly downPayment = computed(() => (this.price() * this.downPct()) / 100);
  readonly loanAmount = computed(() => this.price() - this.downPayment());

  readonly mortgage = computed(() => {
    const p = this.loanAmount();
    const i = this.annualRate() / 1200;
    const n = this.years() * 12;
    if (p <= 0 || n <= 0) return 0;
    if (i <= 0) return p / n;
    return (p * i) / (1 - Math.pow(1 + i, -n));
  });

  readonly monthlyCashFlow = computed(
    () => this.rent() - this.mortgage() - this.expenses()
  );
  readonly annualCashFlow = computed(() => this.monthlyCashFlow() * 12);
  readonly cashOnCash = computed(() => {
    const d = this.downPayment();
    return d > 0 ? (this.annualCashFlow() / d) * 100 : 0;
  });

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

  setPrice(v: number) { this.price.set(this.clampNum(v, 0, 100000000000)); }
  setDownPct(v: number) { this.downPct.set(this.clampNum(v, 0, 100)); }
  setAnnualRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 30)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 1, 40)); }
  setRent(v: number) { this.rent.set(this.clampNum(v, 0, 100000000)); }
  setExpenses(v: number) { this.expenses.set(this.clampNum(v, 0, 100000000)); }

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
