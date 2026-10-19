import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-debt-consolidation-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './debt-consolidation-calculator.component.html',
  styleUrl: './debt-consolidation-calculator.component.scss',
})
export class DebtConsolidationCalculatorComponent implements OnDestroy {
  readonly slug = 'debt-consolidation-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['debt-payoff-calculator', 'credit-card-payoff-calculator', 'debt-to-income-ratio-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly totalDebt = signal(200000);
  readonly currentApr = signal(18);
  readonly currentPayment = signal(8000);
  readonly newApr = signal(10);
  readonly newTerm = signal(36);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private simulate(balance: number, monthlyRate: number, payment: number) {
    let bal = balance;
    let months = 0;
    let total = 0;
    while (bal > 0.005 && months < 1200) {
      months++;
      bal += bal * monthlyRate;
      const p = Math.min(payment, bal);
      bal -= p;
      total += p;
    }
    return { months, total, interest: total - balance };
  }

  private amortPayment(loan: number, apr: number, months: number): number {
    if (months <= 0 || loan <= 0) return 0;
    const i = apr / 1200;
    if (i === 0) return loan / months;
    const f = Math.pow(1 + i, months);
    return (loan * i * f) / (f - 1);
  }

  readonly canPayoffCurrent = computed(() =>
    this.totalDebt() > 0 && this.currentPayment() > this.totalDebt() * (this.currentApr() / 1200)
  );

  readonly current = computed(() => {
    if (!this.canPayoffCurrent()) return { months: 0, total: 0, interest: 0 };
    return this.simulate(this.totalDebt(), this.currentApr() / 1200, this.currentPayment());
  });

  readonly newPayment = computed(() => this.amortPayment(this.totalDebt(), this.newApr(), this.newTerm()));
  readonly newTotal = computed(() => this.newPayment() * this.newTerm());
  readonly newInterest = computed(() => this.newTotal() - this.totalDebt());

  readonly monthlySavings = computed(() => this.currentPayment() - this.newPayment());
  readonly totalSavings = computed(() => this.current().total - this.newTotal());
  readonly verdict = computed(() => (this.totalSavings() > 0 ? 'consolidation' : 'current'));

  readonly moneyFmt = computed(() =>
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

  setTotalDebt(v: number) { this.totalDebt.set(this.clampNum(v, 0, 100000000)); }
  setCurrentApr(v: number) { this.currentApr.set(this.clampNum(v, 0, 60)); }
  setCurrentPayment(v: number) { this.currentPayment.set(this.clampNum(v, 0, 1000000)); }
  setNewApr(v: number) { this.newApr.set(this.clampNum(v, 0, 60)); }
  setNewTerm(v: number) { this.newTerm.set(Math.round(this.clampNum(v, 6, 120))); }

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
