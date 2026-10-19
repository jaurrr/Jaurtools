import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-cash-back-vs-low-interest-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './cash-back-vs-low-interest-calculator.component.html',
  styleUrl: './cash-back-vs-low-interest-calculator.component.scss',
})
export class CashBackVsLowInterestCalculatorComponent implements OnDestroy {
  readonly slug = 'cash-back-vs-low-interest-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['down-payment-calculator', 'compound-interest-calculator', 'credit-card-payoff-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly price = signal(30000);
  readonly cashBack = signal(2000);
  readonly aprCashBack = signal(6.9);
  readonly aprLow = signal(0.9);
  readonly term = signal(60);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private monthlyPayment(loan: number, apr: number, months: number): number {
    if (months <= 0 || loan <= 0) return 0;
    const i = apr / 1200;
    if (i === 0) return loan / months;
    const f = Math.pow(1 + i, months);
    return (loan * i * f) / (f - 1);
  }

  readonly loanA = computed(() => Math.max(this.price() - this.cashBack(), 0));
  readonly payA = computed(() => this.monthlyPayment(this.loanA(), this.aprCashBack(), this.term()));
  readonly totalA = computed(() => this.payA() * this.term());
  readonly interestA = computed(() => this.totalA() - this.loanA());

  readonly payB = computed(() => this.monthlyPayment(this.price(), this.aprLow(), this.term()));
  readonly totalB = computed(() => this.payB() * this.term());
  readonly interestB = computed(() => this.totalB() - this.price());

  readonly winner = computed(() => (this.totalA() <= this.totalB() ? 'cashback' : 'lowapr'));
  readonly savings = computed(() => Math.abs(this.totalA() - this.totalB()));

  readonly moneyFmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  setPrice(v: number) { this.price.set(this.clampNum(v, 0, 10000000)); }
  setCashBack(v: number) { this.cashBack.set(Math.min(this.clampNum(v, 0, 10000000), this.price())); }
  setAprCashBack(v: number) { this.aprCashBack.set(this.clampNum(v, 0, 30)); }
  setAprLow(v: number) { this.aprLow.set(this.clampNum(v, 0, 30)); }
  setTerm(v: number) { this.term.set(Math.round(this.clampNum(v, 12, 84))); }

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
