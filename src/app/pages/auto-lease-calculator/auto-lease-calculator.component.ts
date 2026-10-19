import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-auto-lease-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './auto-lease-calculator.component.html',
  styleUrl: './auto-lease-calculator.component.scss',
})
export class AutoLeaseCalculatorComponent implements OnDestroy {
  readonly slug = 'auto-lease-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['auto-loan-calculator', 'loan-calculator', 'emi-calculator', 'budget-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly capCost = signal(30000);
  readonly downPayment = signal(2000);
  readonly residualPct = signal(55);
  readonly moneyFactor = signal(0.002);
  readonly term = signal(36);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly adjustedCap = computed(() => Math.max(this.capCost() - this.downPayment(), 0));
  readonly residual = computed(() => (this.capCost() * this.residualPct()) / 100);

  readonly depreciation = computed(() =>
    Math.max((this.adjustedCap() - this.residual()) / Math.max(this.term(), 1), 0)
  );

  readonly rentCharge = computed(
    () => (this.adjustedCap() + this.residual()) * this.moneyFactor()
  );

  readonly payment = computed(() => this.depreciation() + this.rentCharge());
  readonly totalLeaseCost = computed(() => this.payment() * this.term() + this.downPayment());
  readonly equivApr = computed(() => this.moneyFactor() * 2400);

  readonly money = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  readonly pct2 = computed(
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

  setCapCost(v: number) { this.capCost.set(this.clampNum(v, 0, 10000000)); }
  setDownPayment(v: number) { this.downPayment.set(this.clampNum(v, 0, 10000000)); }
  setResidualPct(v: number) { this.residualPct.set(this.clampNum(v, 0, 100)); }
  setMoneyFactor(v: number) { this.moneyFactor.set(this.clampNum(v, 0, 0.02)); }
  setTerm(v: number) { this.term.set(Math.round(this.clampNum(v, 1, 120))); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  // Whole monthly payments for labels (years may be fractional).
  readonly payMonths = computed(() => Math.max(1, Math.round(this.term() * 12)));



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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
