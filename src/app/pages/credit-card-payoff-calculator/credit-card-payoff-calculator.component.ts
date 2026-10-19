import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-credit-card-payoff-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './credit-card-payoff-calculator.component.html',
  styleUrl: './credit-card-payoff-calculator.component.scss',
})
export class CreditCardPayoffCalculatorComponent implements OnDestroy {
  readonly slug = 'credit-card-payoff-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['debt-payoff-calculator', 'debt-consolidation-calculator', 'compound-interest-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly balance = signal(50000);
  readonly apr = signal(36);
  readonly payment = signal(3000);

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

  readonly monthlyRate = computed(() => this.apr() / 1200);

  readonly canPayoff = computed(() =>
    this.balance() > 0 && this.payment() > this.balance() * this.monthlyRate()
  );

  readonly result = computed(() => {
    if (!this.canPayoff()) return { months: 0, total: 0, interest: 0 };
    return this.simulate(this.balance(), this.monthlyRate(), this.payment());
  });

  readonly payoffYears = computed(() => Math.floor(this.result().months / 12));
  readonly payoffRemMonths = computed(() => this.result().months % 12);

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

  setBalance(v: number) { this.balance.set(this.clampNum(v, 0, 10000000)); }
  setApr(v: number) { this.apr.set(this.clampNum(v, 0, 60)); }
  setPayment(v: number) { this.payment.set(this.clampNum(v, 0, 1000000)); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

  // Paying 25% more each month: months saved + interest saved.
  readonly boostPayoff = computed(() => {
    const r = this.apr() / 1200;
    const base = this.payment();
    const principal = this.balance();
    if (!(r >= 0) || !(base > 0) || !(principal > 0)) return { monthsSaved: 0, saved: 0 };
    const sim = (pay: number) => {
      let bal = principal, months = 0, intPaid = 0;
      while (bal > 0 && months < 3600) {
        const it = bal * r;
        intPaid += it;
        const pp = Math.min(pay, bal + it);
        bal = bal + it - pp;
        months++;
        if (pp <= it && r > 0) return { months: -1, intPaid: 0 };
      }
      return { months, intPaid };
    };
    const a = sim(base);
    const b = sim(base * 1.25);
    if (a.months < 0 || b.months < 0) return { monthsSaved: 0, saved: 0 };
    return { monthsSaved: Math.max(0, a.months - b.months), saved: Math.max(0, a.intPaid - b.intPaid) };
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
