import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Freq = 'monthly' | 'biweekly' | 'weekly';

@Component({
  selector: 'app-take-home-pay-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './take-home-pay-calculator.component.html',
  styleUrl: './take-home-pay-calculator.component.scss',
})
export class TakeHomePayCalculatorComponent implements OnDestroy {
  readonly slug = 'take-home-pay-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['salary-calculator', 'sales-tax-calculator', 'savings-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly annualGross = signal(60000);
  readonly taxRate = signal(18);
  readonly preTax = signal(3000);
  readonly otherDeductions = signal(1200);
  readonly payFreq = signal<Freq>('monthly');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly paycheck = computed(() => {
    const gross = this.annualGross();
    const taxable = Math.max(0, gross - this.preTax());
    const tax = (taxable * this.taxRate()) / 100;
    const netAnnual = gross - tax - this.otherDeductions();
    const perYear = this.payFreq() === 'monthly' ? 12 : this.payFreq() === 'biweekly' ? 26 : 52;
    return {
      gross,
      taxable,
      tax,
      netAnnual,
      perPaycheck: netAnnual / perYear,
      grossPerPaycheck: gross / perYear,
    };
  });

  readonly money2 = computed(
    () => new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  );
  readonly money0 = computed(
    () => new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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

  readonly freqName = computed(() => {
    const f = this.payFreq();
    return this.t(f === 'monthly' ? 'labels.freqMonthly' : f === 'biweekly' ? 'labels.freqBiweekly' : 'labels.freqWeekly');
  });

  // Per-paycheck slice of every payslip line (periods derived from the annual figures).
  readonly perCheck = computed(() => {
    const p = this.paycheck();
    const periods = p.perPaycheck > 0 ? p.netAnnual / p.perPaycheck : 1;
    return {
      gross: p.grossPerPaycheck,
      tax: p.tax / periods,
      deduct: (this.preTax() + this.otherDeductions()) / periods,
      net: p.perPaycheck,
    };
  });

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  setAnnualGross(v: number) { this.annualGross.set(this.clampNum(v, 0, 100000000)); }
  setTaxRate(v: number) { this.taxRate.set(this.clampNum(v, 0, 60)); }
  setPreTax(v: number) { this.preTax.set(this.clampNum(v, 0, 100000000)); }
  setOtherDeductions(v: number) { this.otherDeductions.set(this.clampNum(v, 0, 100000000)); }
  setPayFreq(v: string) { this.payFreq.set(v as Freq); }

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
