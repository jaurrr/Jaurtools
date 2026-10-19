import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-home-affordability-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './home-affordability-calculator.component.html',
  styleUrl: './home-affordability-calculator.component.scss',
})
export class HomeAffordabilityCalculatorComponent implements OnDestroy {
  readonly slug = 'home-affordability-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fha-loan-calculator', 'home-equity-loan-calculator', 'heloc-calculator', 'finance-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly annualIncome = signal(120000);
  readonly monthlyDebts = signal(500);
  readonly downPayment = signal(50000);
  readonly annualRate = signal(6.5);
  readonly termYears = signal(30);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const monthlyIncome = this.annualIncome() / 12;
    const capHousing = 0.28 * monthlyIncome;
    const capDebt = 0.36 * monthlyIncome - this.monthlyDebts();
    const maxPayment = Math.max(0, Math.min(capHousing, capDebt));
    const binding = capHousing <= capDebt ? 'housing' : 'debt';
    const r = this.annualRate() / 100 / 12;
    const n = this.termYears() * 12;
    const factor = n <= 0 ? 0 : r <= 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n));
    const maxLoan = factor > 0 ? maxPayment / factor : 0;
    const price = maxLoan + this.downPayment();
    return {
      maxPayment,
      binding,
      maxLoan,
      price,
      downPct: price > 0 ? (this.downPayment() / price) * 100 : 0,
    };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    })
  );

  readonly pct = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 })
  );

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  // Gauge + budget-bar view model: where the allowed payment sits against income.
  readonly gauge = computed(() => {
    const monthlyIncome = this.annualIncome() / 12;
    const capHousing = 0.28 * monthlyIncome;
    const capDebt = 0.36 * monthlyIncome - this.monthlyDebts();
    const maxPayment = this.calc().maxPayment;
    const scaleMax = Math.max(1, 0.5 * monthlyIncome);
    return {
      monthlyIncome,
      capHousing,
      capDebt: Math.max(0, capDebt),
      pos: Math.min(100, (maxPayment / scaleMax) * 100),
      half: 0.5 * monthlyIncome,
      housingWidth: Math.min(100, (capHousing / scaleMax) * 100),
      debtWidth: Math.min(100, (Math.max(0, capDebt) / scaleMax) * 100),
    };
  });

  readonly bindingName = computed(() =>
    this.calc().binding === 'housing' ? this.t('labels.housingRule') : this.t('labels.debtRule'),
  );

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

  setAnnualIncome(v: number) { this.annualIncome.set(this.clampNum(v, 0, 50000000)); }
  setMonthlyDebts(v: number) { this.monthlyDebts.set(this.clampNum(v, 0, 1000000)); }
  setDownPayment(v: number) { this.downPayment.set(this.clampNum(v, 0, 20000000)); }
  setAnnualRate(v: number) { this.annualRate.set(this.clampNum(v, 0.5, 15)); }
  setTermYears(v: number) { this.termYears.set(this.clampNum(v, 5, 40)); }

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
