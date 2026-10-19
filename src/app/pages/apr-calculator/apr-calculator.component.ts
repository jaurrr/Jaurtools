import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-apr-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './apr-calculator.component.html',
  styleUrl: './apr-calculator.component.scss',
})
export class AprCalculatorComponent implements OnDestroy {
  readonly slug = 'apr-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['amortization-calculator', 'loan-calculator', 'apy-calculator', 'emi-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly amount = signal(10000);
  readonly fees = signal(200);
  readonly nominalRate = signal(8);
  readonly years = signal(3);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly months = computed(() => this.years() * 12);
  private readonly nominalMonthly = computed(() => this.nominalRate() / 100 / 12);

  readonly monthlyPayment = computed(() => {
    const r = this.nominalMonthly();
    const n = this.months();
    if (r <= 0) return this.amount() / Math.max(n, 1);
    return (this.amount() * r) / (1 - (1 + r) ** -n);
  });

  readonly netReceived = computed(() => Math.max(this.amount() - this.fees(), 0));

  readonly apr = computed(() => {
    const pmt = this.monthlyPayment();
    const n = this.months();
    const net = this.netReceived();
    if (pmt <= 0 || net <= 0 || n <= 0) return 0;
    const pv = (r: number) => (pmt * (1 - (1 + r) ** -n)) / r;
    let lo = 0;
    let hi = 0.1;
    while (pv(hi) > net && hi < 10) hi *= 2;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) > net) lo = mid;
      else hi = mid;
    }
    return ((lo + hi) / 2) * 12 * 100;
  });

  readonly totalOfPayments = computed(() => this.monthlyPayment() * this.months());
  readonly totalCost = computed(() => this.totalOfPayments() - this.netReceived());

  readonly money = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  readonly pct2 = computed(
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

  setAmount(v: number) { this.amount.set(this.clampNum(v, 0, 1000000000)); }
  setFees(v: number) { this.fees.set(this.clampNum(v, 0, 100000000)); }
  setNominalRate(v: number) { this.nominalRate.set(this.clampNum(v, 0, 100)); }
  setYears(v: number) { this.years.set(Math.round(this.clampNum(v, 1, 50))); }

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
