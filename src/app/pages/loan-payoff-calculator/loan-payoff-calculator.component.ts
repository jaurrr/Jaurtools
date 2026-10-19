import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface PayoffResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
}

@Component({
  selector: 'app-loan-payoff-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './loan-payoff-calculator.component.html',
  styleUrl: './loan-payoff-calculator.component.scss',
})
export class LoanPayoffCalculatorComponent implements OnDestroy {
  readonly slug = 'loan-payoff-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['mortgage-payoff-calculator', 'mortgage-calculator', 'lease-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly balance = signal(10000);
  readonly apr = signal(12);
  readonly monthlyPayment = signal(200);
  readonly extraPayment = signal(100);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private simulate(payment: number): PayoffResult | null {
    const r = this.apr() / 1200;
    let bal = this.balance();
    if (bal <= 0) return { months: 0, totalInterest: 0, totalPaid: 0 };
    if (payment <= 0) return null;
    if (r > 0 && payment <= bal * r) return null;
    let months = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    while (bal > 0.005 && months < 1200) {
      const interest = bal * r;
      totalInterest += interest;
      const pay = Math.min(payment, bal + interest);
      totalPaid += pay;
      bal = bal + interest - pay;
      months++;
    }
    if (bal > 0.005) return null;
    return { months, totalInterest, totalPaid };
  }

  readonly base = computed(() => this.simulate(this.monthlyPayment()));
  readonly accelerated = computed(() => this.simulate(this.monthlyPayment() + this.extraPayment()));

  readonly monthsSaved = computed(() => {
    const b = this.base();
    const a = this.accelerated();
    return b && a ? Math.max(0, b.months - a.months) : 0;
  });

  readonly interestSaved = computed(() => {
    const b = this.base();
    const a = this.accelerated();
    return b && a ? Math.max(0, b.totalInterest - a.totalInterest) : 0;
  });

  readonly payoffDate = computed(() => {
    const a = this.accelerated();
    if (!a) return '';
    const d = new Date();
    d.setMonth(d.getMonth() + a.months);
    return new Intl.DateTimeFormat(this.locale(), { month: 'long', year: 'numeric' }).format(d);
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

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

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

  setBalance(v: number) {
    this.balance.set(this.clampNum(v, 0, 100000000));
  }
  setApr(v: number) {
    this.apr.set(this.clampNum(v, 0, 60));
  }
  setMonthlyPayment(v: number) {
    this.monthlyPayment.set(this.clampNum(v, 0, 1000000));
  }
  setExtraPayment(v: number) {
    this.extraPayment.set(this.clampNum(v, 0, 1000000));
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
