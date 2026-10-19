import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SolveFor = 'fv' | 'pv' | 'pmt' | 'n' | 'r';

@Component({
  selector: 'app-finance-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './finance-calculator.component.html',
  styleUrl: './finance-calculator.component.scss',
})
export class FinanceCalculatorComponent implements OnDestroy {
  readonly slug = 'finance-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['future-value-calculator', 'investment-calculator', 'interest-rate-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly solveFor = signal<SolveFor>('fv');
  readonly pv = signal(10000);
  readonly pmt = signal(500);
  readonly annualRate = signal(8);
  readonly years = signal(10);
  readonly targetFv = signal(500000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private fvOf(pv: number, pmt: number, r: number, n: number): number {
    if (n <= 0) return pv;
    if (r <= 0) return pv + pmt * n;
    const g = Math.pow(1 + r, n);
    return pv * g + (pmt * (g - 1)) / r;
  }

  private readonly params = computed(() => {
    const r = this.annualRate() / 100 / 12;
    const n = this.years() * 12;
    return { r, n };
  });

  readonly solved = computed(() => {
    const { r, n } = this.params();
    const pv = this.pv();
    const pmt = this.pmt();
    const fvT = this.targetFv();
    switch (this.solveFor()) {
      case 'fv':
        return { value: this.fvOf(pv, pmt, r, n), ok: true, unit: 'money' as const };
      case 'pv': {
        const g = r <= 0 ? 1 : Math.pow(1 + r, n);
        const value = r <= 0 ? fvT - pmt * n : (fvT - (pmt * (g - 1)) / r) / g;
        return { value, ok: Number.isFinite(value), unit: 'money' as const };
      }
      case 'pmt': {
        const g = r <= 0 ? 1 : Math.pow(1 + r, n);
        const value = r <= 0 ? (fvT - pv) / Math.max(1, n) : ((fvT - pv * g) * r) / (g - 1);
        return { value, ok: Number.isFinite(value), unit: 'money' as const };
      }
      case 'n': {
        const f = (m: number) => this.fvOf(pv, pmt, r, m) - fvT;
        if (f(1) >= 0) return { value: 1 / 12, ok: true, unit: 'years' as const };
        if (f(1200) < 0) return { value: 0, ok: false, unit: 'years' as const };
        let lo = 1;
        let hi = 1200;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (f(mid) < 0) lo = mid;
          else hi = mid;
        }
        return { value: hi / 12, ok: true, unit: 'years' as const };
      }
      case 'r': {
        const g2 = (mr: number) => this.fvOf(pv, pmt, mr, n) - fvT;
        if (g2(0.25) < 0) return { value: 0, ok: false, unit: 'rate' as const };
        let lo = 1e-9;
        let hi = 0.25;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          if (g2(mid) < 0) lo = mid;
          else hi = mid;
        }
        return { value: hi * 12 * 100, ok: true, unit: 'rate' as const };
      }
    }
  });

  readonly summary = computed(() => {
    const { r, n } = this.params();
    const pmt = this.pmt();
    const fv =
      this.solveFor() === 'fv' && this.solved().ok
        ? this.solved().value
        : this.solveFor() === 'n' || this.solveFor() === 'r'
          ? this.fvOf(this.pv(), pmt, r, n)
          : this.targetFv();
    const pvUsed = this.solveFor() === 'pv' && this.solved().ok ? this.solved().value : this.pv();
    const pmtUsed = this.solveFor() === 'pmt' && this.solved().ok ? this.solved().value : pmt;
    const nUsed =
      this.solveFor() === 'n' && this.solved().ok ? this.solved().value * 12 : n;
    const contributed = pvUsed + pmtUsed * nUsed;
    return { fv, contributed, interest: fv - contributed };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    })
  );

  readonly yearsFmt = computed(() =>
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

  setSolveFor(s: SolveFor) { this.solveFor.set(s); }
  setPv(v: number) { this.pv.set(this.clampNum(v, 0, 100000000)); }
  setPmt(v: number) { this.pmt.set(this.clampNum(v, 0, 1000000)); }
  setAnnualRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 50)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 0.5, 100)); }
  setTargetFv(v: number) { this.targetFv.set(this.clampNum(v, 0, 1000000000)); }

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
