import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-emi-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './emi-calculator.component.html',
  styleUrl: './emi-calculator.component.scss',
})
export class EmiCalculatorComponent implements OnDestroy {
  readonly slug = 'emi-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['loan-calculator', 'sip-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly principal = signal(500000);
  readonly annualRate = signal(9);
  readonly years = signal(5);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly results = computed(() => {
    const r = this.annualRate() / 1200;
    const n = Math.max(1, Math.round(this.years() * 12));
    const p = this.principal();
    let emi: number;
    if (r <= 0) {
      emi = p / n;
    } else {
      const factor = Math.pow(1 + r, n);
      emi = (p * r * factor) / (factor - 1);
    }
    const total = emi * n;
    return { emi, interest: total - p, total };
  });

  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
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

  setPrincipal(v: number) { this.principal.set(this.clampNum(v, 10000, 5000000)); }
  setRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 30)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 1, 30)); }

  // One extra EMI per year (spread monthly): months saved + interest saved.
  readonly payoff = computed(() => {
    const { emi, interest } = this.results();
    const r = this.annualRate() / 1200;
    const n = Math.max(1, Math.round(this.years() * 12));
    if (r <= 0) return { months: n, saved: 0, interestSaved: 0 };
    const pay = emi + emi / 12;
    let bal = this.principal();
    let months = 0;
    let intPaid = 0;
    while (bal > 0 && months < 1200) {
      const i = bal * r;
      intPaid += i;
      bal = bal + i - pay;
      months++;
    }
    return { months, saved: Math.max(0, n - months), interestSaved: Math.max(0, interest - intPaid) };
  });

  // Precomputed reference grid: EMI at 9% for common amounts x tenures.
  readonly emiGrid = computed(() => {
    const r = 9 / 1200;
    const amounts = [500000, 1000000, 2500000, 5000000];
    const tenures = [10, 15, 20, 25];
    const f = this.fmt();
    const emiFor = (p: number, yrs: number) => {
      const n = yrs * 12;
      const fac = Math.pow(1 + r, n);
      return (p * r * fac) / (fac - 1);
    };
    return {
      amounts: amounts.map((a) => f.format(a)),
      tenures,
      cells: amounts.map((a) => tenures.map((y) => f.format(emiFor(a, y)))),
    };
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
