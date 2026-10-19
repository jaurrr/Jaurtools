import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-rent-vs-buy-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './rent-vs-buy-calculator.component.html',
  styleUrl: './rent-vs-buy-calculator.component.scss',
})
export class RentVsBuyCalculatorComponent implements OnDestroy {
  readonly slug = 'rent-vs-buy-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rent-calculator', 'real-estate-calculator', 'price-per-square-foot-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly price = signal(5000000);
  readonly downPct = signal(20);
  readonly closingPct = signal(2);
  readonly annualRate = signal(9);
  readonly years = signal(20);
  readonly rent = signal(25000);
  readonly rentGrowth = signal(5);
  readonly appreciation = signal(5);
  readonly ownCostPct = signal(3);
  readonly horizon = signal(7);

  readonly money0 = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );

  readonly downPayment = computed(() => (this.price() * this.downPct()) / 100);
  readonly closingCosts = computed(() => (this.price() * this.closingPct()) / 100);
  readonly loanAmount = computed(() => this.price() - this.downPayment());

  readonly monthlyMortgage = computed(() => {
    const p = this.loanAmount();
    const i = this.annualRate() / 1200;
    const n = this.years() * 12;
    if (p <= 0 || n <= 0) return 0;
    if (i <= 0) return p / n;
    return (p * i) / (1 - Math.pow(1 + i, -n));
  });

  private growthSum(ratePct: number, yrs: number): number {
    const g = 1 + ratePct / 100;
    let s = 0;
    for (let t = 1; t <= yrs; t++) s += Math.pow(g, t);
    return s;
  }

  readonly totalRentCost = computed(
    () => this.rent() * 12 * this.growthSum(this.rentGrowth(), this.horizon())
  );

  readonly homeValue = computed(
    () => this.price() * Math.pow(1 + this.appreciation() / 100, this.horizon())
  );

  readonly loanBalance = computed(() => {
    const p = this.loanAmount();
    const i = this.annualRate() / 1200;
    const n = Math.min(this.horizon() * 12, this.years() * 12);
    const m = this.monthlyMortgage();
    if (p <= 0 || n <= 0) return 0;
    if (i <= 0) return Math.max(0, p - m * n);
    const grown = p * Math.pow(1 + i, n);
    const paid = m * ((Math.pow(1 + i, n) - 1) / i);
    return Math.max(0, grown - paid);
  });

  readonly equity = computed(() => this.homeValue() - this.loanBalance());

  readonly totalBuyPaid = computed(
    () =>
      this.downPayment() +
      this.closingCosts() +
      this.monthlyMortgage() * this.horizon() * 12 +
      (this.price() * this.ownCostPct()) / 100 * this.growthSum(this.appreciation(), this.horizon())
  );

  readonly netBuyCost = computed(() => this.totalBuyPaid() - this.equity());
  readonly difference = computed(() => this.totalRentCost() - this.netBuyCost());

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

  readonly absDiff = computed(() => Math.abs(this.difference()));

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
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
  setClosingPct(v: number) { this.closingPct.set(this.clampNum(v, 0, 20)); }
  setAnnualRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 30)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 1, 40)); }
  setRent(v: number) { this.rent.set(this.clampNum(v, 0, 100000000)); }
  setRentGrowth(v: number) { this.rentGrowth.set(this.clampNum(v, 0, 20)); }
  setAppreciation(v: number) { this.appreciation.set(this.clampNum(v, -10, 20)); }
  setOwnCostPct(v: number) { this.ownCostPct.set(this.clampNum(v, 0, 15)); }
  setHorizon(v: number) { this.horizon.set(this.clampNum(v, 1, 40)); }

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
