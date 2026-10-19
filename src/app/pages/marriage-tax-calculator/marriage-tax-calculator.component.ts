import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SINGLE_BRACKETS: Array<[number, number]> = [
  [11600, 0.1],
  [47150, 0.12],
  [100525, 0.22],
  [191950, 0.24],
  [243725, 0.32],
  [609350, 0.35],
  [Infinity, 0.37],
];
const MFJ_BRACKETS: Array<[number, number]> = [
  [23200, 0.1],
  [94300, 0.12],
  [201050, 0.22],
  [383900, 0.24],
  [487450, 0.32],
  [731200, 0.35],
  [Infinity, 0.37],
];
const SINGLE_DEDUCTION = 14600;
const MFJ_DEDUCTION = 29200;

@Component({
  selector: 'app-marriage-tax-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './marriage-tax-calculator.component.html',
  styleUrl: './marriage-tax-calculator.component.scss',
})
export class MarriageTaxCalculatorComponent implements OnDestroy {
  readonly slug = 'marriage-tax-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ira-calculator', 'percentage-calculator', 'money-counter', 'bmi-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly income1 = signal(120000);
  readonly income2 = signal(20000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private taxOn(taxable: number, brackets: Array<[number, number]>): number {
    let tax = 0;
    let prev = 0;
    for (const [cap, rate] of brackets) {
      if (taxable <= prev) break;
      tax += (Math.min(taxable, cap) - prev) * rate;
      prev = cap;
    }
    return tax;
  }

  readonly jointTax = computed(() => {
    const taxable = Math.max(0, this.income1() + this.income2() - MFJ_DEDUCTION);
    return this.taxOn(taxable, MFJ_BRACKETS);
  });

  readonly separateTax = computed(
    () =>
      this.taxOn(Math.max(0, this.income1() - SINGLE_DEDUCTION), SINGLE_BRACKETS) +
      this.taxOn(Math.max(0, this.income2() - SINGLE_DEDUCTION), SINGLE_BRACKETS)
  );

  readonly difference = computed(() => this.separateTax() - this.jointTax());

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

  setIncome1(v: number) {
    this.income1.set(this.clampNum(v, 0, 100000000));
  }
  setIncome2(v: number) {
    this.income2.set(this.clampNum(v, 0, 100000000));
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
