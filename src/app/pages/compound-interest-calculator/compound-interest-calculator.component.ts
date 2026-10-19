import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Freq = 'annually' | 'halfYearly' | 'quarterly' | 'monthly' | 'daily';

@Component({
  selector: 'app-compound-interest-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './compound-interest-calculator.component.html',
  styleUrl: './compound-interest-calculator.component.scss',
})
export class CompoundInterestCalculatorComponent implements OnDestroy {
  readonly slug = 'compound-interest-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fixed-deposit-calculator', 'college-cost-calculator', 'sip-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly principal = signal(50000);
  readonly rate = signal(8);
  readonly freq = signal<Freq>('monthly');
  readonly years = signal(10);
  readonly monthlyContrib = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly periodsPerYear = computed(() => {
    const f = this.freq();
    return f === 'daily' ? 365 : f === 'monthly' ? 12 : f === 'quarterly' ? 4 : f === 'halfYearly' ? 2 : 1;
  });

  private readonly growthCalc = computed(() => {
    const n = this.periodsPerYear();
    const i = this.rate() / 100 / n;
    const periods = n * this.years();
    const growth = Math.pow(1 + i, periods);
    return { n, i, periods, growth };
  });

  readonly finalAmount = computed(() => {
    const { i, growth } = this.growthCalc();
    const finalPrincipal = this.principal() * growth;
    const perPeriod = (this.monthlyContrib() * 12) / this.periodsPerYear();
    const contribFv = i === 0 ? perPeriod * this.growthCalc().periods : perPeriod * ((growth - 1) / i);
    return finalPrincipal + contribFv;
  });

  readonly totalContrib = computed(
    () => this.principal() + this.monthlyContrib() * 12 * this.years()
  );

  readonly interest = computed(() => this.finalAmount() - this.totalContrib());

  // Year-by-year balance for the growth chart (same math as finalAmount).
  readonly yearlyBars = computed(() => {
    const { i, n } = this.growthCalc();
    const yrs = Math.max(1, Math.round(this.years()));
    const p = this.principal();
    const perPeriod = (this.monthlyContrib() * 12) / n;
    const rows: { year: number; balance: number; height: number; showLabel: boolean }[] = [];
    const step = Math.max(1, Math.ceil(yrs / 12));
    for (let y = 1; y <= yrs; y++) {
      const periods = n * y;
      const g = Math.pow(1 + i, periods);
      const balance = p * g + (i === 0 ? perPeriod * periods : perPeriod * ((g - 1) / i));
      rows.push({ year: y, balance, height: 0, showLabel: y === 1 || y === yrs || y % step === 1 });
    }
    const max = Math.max(1, ...rows.map((r) => r.balance));
    return rows.map((r) => ({ ...r, height: (r.balance / max) * 100 }));
  });

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  readonly multiple = computed(() =>
    this.principal() > 0 ? this.finalAmount() / this.principal() : 0
  );

  readonly moneyFmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  readonly twoFmt = computed(() =>
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

  setPrincipal(v: number) { this.principal.set(this.clampNum(v, 0, 100000000)); }
  setRate(v: number) { this.rate.set(this.clampNum(v, 0, 30)); }
  setFreq(v: string) {
    if (v === 'annually' || v === 'halfYearly' || v === 'quarterly' || v === 'monthly' || v === 'daily') {
      this.freq.set(v);
    }
  }
  setYears(v: number) { this.years.set(Math.round(this.clampNum(v, 1, 50))); }
  setMonthlyContrib(v: number) { this.monthlyContrib.set(this.clampNum(v, 0, 1000000)); }

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
