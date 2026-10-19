import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface LifespanResult {
  years: number;
  totalWithdrawn: number;
  indefinite: boolean;
}

@Component({
  selector: 'app-how-long-will-my-money-last-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './how-long-will-my-money-last-calculator.component.html',
  styleUrl: './how-long-will-my-money-last-calculator.component.scss',
})
export class HowLongWillMyMoneyLastCalculatorComponent implements OnDestroy {
  readonly slug = 'how-long-will-my-money-last-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = [
    'ira-calculator',
    'money-market-account-calculator',
    'mortgage-payoff-calculator',
    'percentage-calculator',
  ];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly savings = signal(500000);
  readonly annualReturn = signal(5);
  readonly annualWithdrawal = signal(40000);
  readonly inflation = signal(2);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed<LifespanResult>(() => {
    const r = this.annualReturn() / 100;
    const i = this.inflation() / 100;
    const start = this.savings();
    let w = this.annualWithdrawal();
    if (start <= 0 || w <= 0) return { years: 0, totalWithdrawn: 0, indefinite: false };
    if (w <= start * r && i <= r) return { years: -1, totalWithdrawn: 0, indefinite: true };
    let bal = start;
    let years = 0;
    let totalWithdrawn = 0;
    while (bal > 0 && years < 100) {
      bal = bal * (1 + r) - w;
      totalWithdrawn += w;
      w = w * (1 + i);
      years++;
      if (bal <= 0) break;
    }
    if (years >= 100) return { years: -1, totalWithdrawn, indefinite: true };
    return { years, totalWithdrawn, indefinite: false };
  });

  readonly moneyFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
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

  setSavings(v: number) {
    this.savings.set(this.clampNum(v, 0, 1000000000));
  }
  setAnnualReturn(v: number) {
    this.annualReturn.set(this.clampNum(v, 0, 30));
  }
  setAnnualWithdrawal(v: number) {
    this.annualWithdrawal.set(this.clampNum(v, 0, 100000000));
  }
  setInflation(v: number) {
    this.inflation.set(this.clampNum(v, 0, 20));
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
