import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Bracket {
  limit: number;
  rate: number;
}

@Component({
  selector: 'app-income-tax-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './income-tax-calculator.component.html',
  styleUrl: './income-tax-calculator.component.scss',
})
export class IncomeTaxCalculatorComponent implements OnDestroy {
  readonly slug = 'income-tax-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['gst-calculator', 'salary-to-hourly-calculator', 'percentage-calculator', 'finance-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly income = signal(100000);
  readonly deduction = signal(15750);

  private readonly brackets: Bracket[] = [
    { limit: 11925, rate: 0.1 },
    { limit: 48475, rate: 0.12 },
    { limit: 103350, rate: 0.22 },
    { limit: 197300, rate: 0.24 },
    { limit: 250525, rate: 0.32 },
    { limit: 626350, rate: 0.35 },
    { limit: Number.POSITIVE_INFINITY, rate: 0.37 },
  ];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const taxable = Math.max(0, this.income() - this.deduction());
    let tax = 0;
    let marginal = 0;
    let prev = 0;
    for (const b of this.brackets) {
      if (taxable > prev) {
        const inBracket = Math.min(taxable, b.limit) - prev;
        tax += inBracket * b.rate;
        marginal = b.rate;
      }
      prev = b.limit;
      if (taxable <= b.limit) break;
    }
    const effective = this.income() > 0 ? (tax / this.income()) * 100 : 0;
    return { taxable, tax, marginal: marginal * 100, effective };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    })
  );

  readonly pct = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
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

  setIncome(v: number) { this.income.set(this.clampNum(v, 0, 100000000)); }
  setDeduction(v: number) { this.deduction.set(this.clampNum(v, 0, 100000000)); }

  // Per-bracket breakdown for the slab chart (amount and tax inside each bracket).
  readonly slabRows = computed(() => {
    const taxable = Math.max(0, this.income() - this.deduction());
    const f = this.money();
    let prev = 0;
    const rows: { range: string; rate: number; amount: number; tax: number }[] = [];
    for (const b of this.brackets) {
      if (taxable <= prev) break;
      const amount = Math.min(taxable, b.limit) - prev;
      const hi = b.limit === Number.POSITIVE_INFINITY ? `${f.format(prev)}+` : `${f.format(prev)} – ${f.format(b.limit)}`;
      rows.push({ range: hi, rate: b.rate * 100, amount, tax: amount * b.rate });
      prev = b.limit;
    }
    const maxTax = Math.max(1, ...rows.map((r) => r.tax));
    return rows.map((r) => ({ ...r, width: (r.tax / maxTax) * 100 }));
  });

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
