import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-lease-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './lease-calculator.component.html',
  styleUrl: './lease-calculator.component.scss',
})
export class LeaseCalculatorComponent implements OnDestroy {
  readonly slug = 'lease-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['loan-payoff-calculator', 'mortgage-calculator', 'irr-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly price = signal(30000);
  readonly downPayment = signal(2000);
  readonly residual = signal(18000);
  readonly annualRate = signal(6);
  readonly termMonths = signal(36);
  readonly taxRate = signal(7);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly netCapCost = computed(() => Math.max(0, this.price() - this.downPayment()));
  readonly moneyFactor = computed(() => this.annualRate() / 2400);
  readonly depreciationFee = computed(() => {
    const term = this.termMonths();
    if (term <= 0) return 0;
    return Math.max(0, (this.netCapCost() - this.residual()) / term);
  });
  readonly financeFee = computed(() => (this.netCapCost() + this.residual()) * this.moneyFactor());
  readonly basePayment = computed(() => this.depreciationFee() + this.financeFee());
  readonly taxAmt = computed(() => (this.basePayment() * this.taxRate()) / 100);
  readonly monthlyPayment = computed(() => this.basePayment() + this.taxAmt());
  readonly totalCost = computed(() => this.monthlyPayment() * this.termMonths() + this.downPayment());

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

  setPrice(v: number) {
    this.price.set(this.clampNum(v, 0, 10000000));
  }
  setDownPayment(v: number) {
    this.downPayment.set(this.clampNum(v, 0, 10000000));
  }
  setResidual(v: number) {
    this.residual.set(this.clampNum(v, 0, 10000000));
  }
  setAnnualRate(v: number) {
    this.annualRate.set(this.clampNum(v, 0, 30));
  }
  setTermMonths(v: number) {
    this.termMonths.set(this.clampNum(v, 1, 84));
  }
  setTaxRate(v: number) {
    this.taxRate.set(this.clampNum(v, 0, 30));
  }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  // Whole monthly payments for labels (years may be fractional).
  readonly payMonths = computed(() => Math.max(1, Math.round(this.termMonths() * 12)));

  // One extra EMI per year (spread monthly): months saved + interest saved.
  readonly extraPayoff = computed(() => {
    const r = this.annualRate() / 1200;
    const n = Math.max(1, Math.round(this.termMonths() * 12));
    const emi = this.monthlyPayment();
    const principal = this.price();
    if (!(r > 0) || !(emi > 0) || !(principal > 0)) return { months: 0, saved: 0 };
    const pay = emi + emi / 12;
    let bal = principal, months = 0, intPaid = 0;
    while (bal > 0 && months < 3600) {
      const it = bal * r;
      intPaid += it;
      bal = bal + it - pay;
      months++;
    }
    const totalInt = emi * n - principal;
    return { months: Math.max(0, n - months), saved: Math.max(0, totalInt - intPaid) };
  });

  // Precomputed reference: monthly payment for common amounts x tenures at 6%.
  readonly refGrid = computed(() => {
    const r = 6 / 1200;
    const f = this.moneyFmt();
    const amounts = [20000, 50000, 100000];
    const tenures = [10, 15, 20, 25];
    const payFor = (pp: number, yrs: number) => {
      const nn = yrs * 12;
      const fac = Math.pow(1 + r, nn);
      return r <= 0 ? pp / nn : (pp * r * fac) / (fac - 1);
    };
    return {
      amounts: amounts.map((a) => f.format(a)),
      tenures,
      cells: amounts.map((a) => tenures.map((yy) => f.format(payFor(a, yy)))),
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
