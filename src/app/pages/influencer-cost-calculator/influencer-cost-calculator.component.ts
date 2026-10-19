import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-influencer-cost-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './influencer-cost-calculator.component.html',
  styleUrl: './influencer-cost-calculator.component.scss',
})
export class InfluencerCostCalculatorComponent implements OnDestroy {
  readonly slug = 'influencer-cost-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['engagement-rate-calculator', 'roas-calculator', 'marketing-budget-calculator', 'lead-scoring-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly followers = signal(50000);
  readonly engagementRate = signal(3.5);
  readonly currency = signal('USD');

  readonly currencies = ['USD', 'INR', 'EUR', 'AED'];

  private readonly fx: Record<string, number> = { USD: 1, INR: 83, EUR: 0.92, AED: 3.67 };

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly tier = computed(() => {
    const f = this.followers();
    if (f < 10000) return 'nano';
    if (f < 100000) return 'micro';
    if (f < 500000) return 'mid';
    return 'macro';
  });

  readonly ratePer1k = computed(() => {
    const f = this.followers();
    if (f < 10000) return 25;
    if (f < 100000) return 15;
    if (f < 500000) return 8;
    return 5;
  });

  readonly baseUsd = computed(() => (this.followers() / 1000) * this.ratePer1k());

  readonly multiplier = computed(() => {
    if (!Number.isFinite(this.engagementRate()) || this.engagementRate() < 0) return 1;
    return Math.min(2, Math.max(0.5, this.engagementRate() / 3));
  });

  readonly estimateUsd = computed(() => this.baseUsd() * this.multiplier());

  readonly rangeUsd = computed(() => ({
    lo: this.estimateUsd() * 0.8,
    hi: this.estimateUsd() * 1.5,
  }));

  readonly money = computed(() => {
    this.translate.lang();
    return new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    });
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  inCurrency(usd: number): number {
    return usd * (this.fx[this.currency()] ?? 1);
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

  setFollowers(v: number) { this.followers.set(this.clampNum(v, 0, 500000000)); }
  setEngagementRate(v: number) { this.engagementRate.set(this.clampNum(v, 0, 100)); }
  setCurrency(c: string) {
    if (this.currencies.includes(c)) this.currency.set(c);
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
