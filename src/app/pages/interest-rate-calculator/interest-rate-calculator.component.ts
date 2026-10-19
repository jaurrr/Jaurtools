import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-interest-rate-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './interest-rate-calculator.component.html',
  styleUrl: './interest-rate-calculator.component.scss',
})
export class InterestRateCalculatorComponent implements OnDestroy {
  readonly slug = 'interest-rate-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['finance-calculator', 'future-value-calculator', 'investment-calculator', 'forex-compounding-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pv = signal(10000);
  readonly fv = signal(20000);
  readonly payment = signal(0);
  readonly years = signal(10);
  readonly frequency = signal<'annual' | 'monthly'>('annual');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const perYear = this.frequency() === 'monthly' ? 12 : 1;
    const n = Math.max(0.5, this.years() * perYear);
    const pmt = this.payment();
    const pv = this.pv();
    const fv = this.fv();
    const f = (r: number): number => {
      if (r <= 0) return pv + pmt * n - fv;
      const g = Math.pow(1 + r, n);
      return pv * g + (pmt * (g - 1)) / r - fv;
    };
    let lo = 1e-9;
    let hi = 2;
    let ok = false;
    if (f(lo) <= 0 && f(hi) >= 0) {
      ok = true;
    } else if (f(lo) > 0 && f(-0.9) <= 0) {
      lo = -0.9;
      hi = 1e-9;
      ok = true;
    }
    let rate: number | null = null;
    if (ok) {
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid;
        else hi = mid;
      }
      rate = hi;
    }
    const annualRate =
      rate === null ? null : this.frequency() === 'monthly' ? rate * 12 * 100 : rate * 100;
    const doubling = annualRate !== null && annualRate > 0 ? 72 / annualRate : null;
    return { annualRate, doubling, ok };
  });

  readonly pct = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
  );

  readonly num = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 })
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

  setFrequency(fq: 'annual' | 'monthly') { this.frequency.set(fq); }
  setPv(v: number) { this.pv.set(this.clampNum(v, 0, 1000000000)); }
  setFv(v: number) { this.fv.set(this.clampNum(v, 0, 1000000000)); }
  setPayment(v: number) { this.payment.set(this.clampNum(v, 0, 10000000)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 0.5, 100)); }

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
