import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CashFlow {
  date: string;
  amount: number;
}

@Component({
  selector: 'app-xirr-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './xirr-calculator.component.html',
  styleUrl: './xirr-calculator.component.scss',
})
export class XirrCalculatorComponent implements OnDestroy {
  readonly slug = 'xirr-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['npv-calculator', 'dividend-yield-calculator', 'investment-fee-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly flows = signal<CashFlow[]>([
    { date: '2024-01-01', amount: -10000 },
    { date: '2025-01-01', amount: 11000 },
    { date: '', amount: 0 },
    { date: '', amount: 0 },
    { date: '', amount: 0 },
    { date: '', amount: 0 },
  ]);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private parsed(): { t: number; cf: number }[] {
    const rows = this.flows()
      .filter((f) => f.date && f.amount !== 0 && !Number.isNaN(Date.parse(f.date)))
      .map((f) => ({ date: new Date(f.date + 'T00:00:00'), cf: f.amount }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (rows.length < 2) return [];
    const d0 = rows[0].date.getTime();
    return rows.map((r) => ({ t: (r.date.getTime() - d0) / 86400000 / 365, cf: r.cf }));
  }

  private xnpv(r: number, rows: { t: number; cf: number }[]): number {
    return rows.reduce((s, row) => s + row.cf / Math.pow(1 + r, row.t), 0);
  }

  readonly xirr = computed(() => {
    const rows = this.parsed();
    if (rows.length < 2) return null;
    const hasPos = rows.some((r) => r.cf > 0);
    const hasNeg = rows.some((r) => r.cf < 0);
    if (!hasPos || !hasNeg) return null;
    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      const f = this.xnpv(r, rows);
      const h = 1e-6;
      const fp = (this.xnpv(r + h, rows) - this.xnpv(r - h, rows)) / (2 * h);
      if (!Number.isFinite(fp) || fp === 0) return null;
      const nr = r - f / fp;
      if (!Number.isFinite(nr) || nr <= -1) return null;
      if (Math.abs(nr - r) < 1e-10) return nr;
      r = nr;
    }
    return null;
  });

  readonly flowCount = computed(() => this.parsed().length);

  readonly percent = computed(() =>
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

  setFlowDate(i: number, v: string) {
    this.flows.update((f) => f.map((row, idx) => (idx === i ? { ...row, date: v } : row)));
  }

  setFlowAmount(i: number, v: number) {
    const amount = Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    this.flows.update((f) => f.map((row, idx) => (idx === i ? { ...row, amount } : row)));
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
