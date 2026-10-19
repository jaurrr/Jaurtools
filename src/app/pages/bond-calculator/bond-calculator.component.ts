import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-bond-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './bond-calculator.component.html',
  styleUrl: './bond-calculator.component.scss',
})
export class BondCalculatorComponent implements OnDestroy {
  readonly slug = 'bond-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['apy-calculator', 'cagr-calculator', 'annuity-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly face = signal(1000);
  readonly coupon = signal(5);
  readonly years = signal(10);
  readonly yieldPct = signal(6);
  readonly freq = signal(1);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly couponPerPeriod = computed(() => (this.face() * this.coupon()) / 100 / this.freq());
  private readonly periods = computed(() => this.years() * this.freq());
  private readonly periodRate = computed(() => this.yieldPct() / 100 / this.freq());

  readonly price = computed(() => {
    const c = this.couponPerPeriod();
    const n = this.periods();
    const r = this.periodRate();
    if (r <= 0) return c * n + this.face();
    const pvCoupons = (c * (1 - (1 + r) ** -n)) / r;
    return pvCoupons + this.face() / (1 + r) ** n;
  });

  readonly currentYield = computed(() => {
    if (this.price() <= 0) return 0;
    return ((this.couponPerPeriod() * this.freq()) / this.price()) * 100;
  });

  readonly premiumDiscount = computed(() => this.price() - this.face());
  readonly isPremium = computed(() => this.premiumDiscount() >= 0);

  readonly money = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
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

  setFace(v: number) { this.face.set(this.clampNum(v, 0, 100000000)); }
  setCoupon(v: number) { this.coupon.set(this.clampNum(v, 0, 100)); }
  setYears(v: number) { this.years.set(Math.round(this.clampNum(v, 1, 100))); }
  setYieldPct(v: number) { this.yieldPct.set(this.clampNum(v, 0, 100)); }
  setFreq(v: number) { this.freq.set(v === 2 ? 2 : 1); }

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
