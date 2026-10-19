import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-refinance-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './refinance-calculator.component.html',
  styleUrl: './refinance-calculator.component.scss',
})
export class RefinanceCalculatorComponent implements OnDestroy {
  readonly slug = 'refinance-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['personal-loan-calculator', 'time-value-of-money-calculator', 'present-value-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly balance = signal(300000);
  readonly currentRate = signal(7.5);
  readonly newRate = signal(6.0);
  readonly remainingYears = signal(20);
  readonly newTermYears = signal(20);
  readonly closingCosts = signal(6000);

  readonly money0 = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  readonly money2 = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  private monthlyPayment(principal: number, monthlyRate: number, months: number): number {
    if (principal <= 0 || months <= 0) return 0;
    if (monthlyRate <= 0) return principal / months;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }

  readonly currentPayment = computed(() =>
    this.monthlyPayment(this.balance(), this.currentRate() / 1200, this.remainingYears() * 12)
  );
  readonly newPayment = computed(() =>
    this.monthlyPayment(this.balance(), this.newRate() / 1200, this.newTermYears() * 12)
  );
  readonly monthlySavings = computed(() => this.currentPayment() - this.newPayment());
  readonly breakEvenMonths = computed(() => {
    const saving = this.monthlySavings();
    return saving > 0 ? this.closingCosts() / saving : NaN;
  });
  readonly lifetimeSavings = computed(
    () =>
      this.currentPayment() * this.remainingYears() * 12 -
      this.newPayment() * this.newTermYears() * 12 -
      this.closingCosts()
  );

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

  setBalance(v: number) { this.balance.set(this.clampNum(v, 0, 100000000)); }
  setCurrentRate(v: number) { this.currentRate.set(this.clampNum(v, 0, 30)); }
  setNewRate(v: number) { this.newRate.set(this.clampNum(v, 0, 30)); }
  setRemainingYears(v: number) { this.remainingYears.set(this.clampNum(v, 1, 40)); }
  setNewTermYears(v: number) { this.newTermYears.set(this.clampNum(v, 1, 40)); }
  setClosingCosts(v: number) { this.closingCosts.set(this.clampNum(v, 0, 1000000)); }

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
