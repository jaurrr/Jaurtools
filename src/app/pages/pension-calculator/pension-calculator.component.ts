import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-pension-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pension-calculator.component.html',
  styleUrl: './pension-calculator.component.scss',
})
export class PensionCalculatorComponent implements OnDestroy {
  readonly slug = 'pension-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['mutual-fund-calculator', 'present-value-calculator', 'pay-raise-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly currentAge = signal(30);
  readonly retireAge = signal(60);
  readonly savings = signal(500000);
  readonly monthly = signal(20000);
  readonly annualReturn = signal(10);
  readonly payoutYears = signal(20);

  readonly money0 = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );

  readonly yearsToRetire = computed(() =>
    Math.max(0, this.retireAge() - this.currentAge())
  );

  private sipFutureValue(monthlyAmt: number, annualPct: number, yrs: number): number {
    const i = annualPct / 1200;
    const n = yrs * 12;
    if (n <= 0) return 0;
    if (i <= 0) return monthlyAmt * n;
    return (monthlyAmt * (Math.pow(1 + i, n) - 1)) / i;
  }

  readonly corpus = computed(() => {
    const yrs = this.yearsToRetire();
    const grown = this.savings() * Math.pow(1 + this.annualReturn() / 1200, yrs * 12);
    return grown + this.sipFutureValue(this.monthly(), this.annualReturn(), yrs);
  });

  readonly monthlyPension = computed(() => {
    const c = this.corpus();
    const i = this.annualReturn() / 1200;
    const n = this.payoutYears() * 12;
    if (c <= 0 || n <= 0) return 0;
    if (i <= 0) return c / n;
    return (c * i) / (1 - Math.pow(1 + i, -n));
  });

  readonly totalContributed = computed(
    () => this.savings() + this.monthly() * this.yearsToRetire() * 12
  );
  readonly growth = computed(() => this.corpus() - this.totalContributed());

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

  setCurrentAge(v: number) { this.currentAge.set(this.clampNum(v, 18, 90)); }
  setRetireAge(v: number) { this.retireAge.set(this.clampNum(v, 30, 100)); }
  setSavings(v: number) { this.savings.set(this.clampNum(v, 0, 1000000000)); }
  setMonthly(v: number) { this.monthly.set(this.clampNum(v, 0, 10000000)); }
  setAnnualReturn(v: number) { this.annualReturn.set(this.clampNum(v, -10, 30)); }
  setPayoutYears(v: number) { this.payoutYears.set(this.clampNum(v, 1, 50)); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  // Precomputed reference: illustrative future value of monthly investing at the current rate.
  readonly refScenarios = computed(() => {
    const r = this.annualReturn() / 1200;
    const f = this.money0();
    const amounts = [10000, 20000, 50000];
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
