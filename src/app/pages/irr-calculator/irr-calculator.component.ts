import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-irr-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './irr-calculator.component.html',
  styleUrl: './irr-calculator.component.scss',
})
export class IrrCalculatorComponent implements OnDestroy {
  readonly slug = 'irr-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ira-calculator', 'margin-markup-calculator', 'lease-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly initial = signal(10000);
  readonly flows = signal<number[]>([2000, 3000, 4000, 5000, 0, 0, 0, 0]);
  readonly yearsList = [1, 2, 3, 4, 5, 6, 7, 8];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private npv(rate: number): number {
    let sum = -this.initial();
    const flows = this.flows();
    for (let i = 0; i < flows.length; i++) {
      sum += flows[i] / Math.pow(1 + rate, i + 1);
    }
    return sum;
  }

  readonly irr = computed(() => {
    const lo = -0.9999;
    const hi = 10;
    const nLo = this.npv(lo);
    const nHi = this.npv(hi);
    if (!Number.isFinite(nLo) || !Number.isFinite(nHi)) return null;
    if (nLo === 0) return lo;
    if (nHi === 0) return hi;
    if (Math.sign(nLo) === Math.sign(nHi)) return null;
    let a = lo;
    let b = hi;
    for (let k = 0; k < 200; k++) {
      const m = (a + b) / 2;
      const nM = this.npv(m);
      if (!Number.isFinite(nM)) return null;
      if (Math.abs(nM) < 0.0001) return m;
      if (Math.sign(nM) === Math.sign(this.npv(a))) {
        a = m;
      } else {
        b = m;
      }
    }
    return (a + b) / 2;
  });

  readonly irrPct = computed(() => {
    const v = this.irr();
    return v === null ? null : v * 100;
  });

  readonly totalReceived = computed(() => this.flows().reduce((s, f) => s + f, 0));
  readonly netProfit = computed(() => this.totalReceived() - this.initial());

  readonly pctFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
  readonly moneyFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
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

  setInitial(v: number) {
    this.initial.set(this.clampNum(v, 0, 100000000));
  }

  setFlow(i: number, v: number) {
    const val = this.clampNum(v, -100000000, 100000000);
    this.flows.update((list) => list.map((f, idx) => (idx === i ? val : f)));
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
