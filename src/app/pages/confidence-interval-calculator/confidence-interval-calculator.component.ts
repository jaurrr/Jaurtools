import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-confidence-interval-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './confidence-interval-calculator.component.html',
  styleUrl: './confidence-interval-calculator.component.scss',
})
export class ConfidenceIntervalCalculatorComponent implements OnDestroy {
  readonly slug = 'confidence-interval-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['average-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'mean' | 'proportion'>('mean');
  readonly sampleMean = signal(50);
  readonly stdDev = signal(10);
  readonly n = signal(100);
  readonly prop = signal(0.6);
  readonly propN = signal(400);
  readonly confidence = signal(95);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly z = computed(() => {
    const c = this.confidence();
    if (c === 90) return 1.6448536269514729;
    if (c === 99) return 2.5758293035489004;
    return 1.959963984540054;
  });

  readonly meanCI = computed(() => {
    const s = this.stdDev();
    const n = this.n();
    if (!(s >= 0) || !(n >= 2)) return null;
    const se = s / Math.sqrt(n);
    const margin = this.z() * se;
    const m = this.sampleMean();
    return { se, margin, lo: m - margin, hi: m + margin };
  });

  readonly propCI = computed(() => {
    const p = this.prop();
    const n = this.propN();
    if (!(p >= 0) || !(p <= 1) || !(n >= 2)) return null;
    const se = Math.sqrt((p * (1 - p)) / n);
    const margin = this.z() * se;
    return {
      se,
      margin,
      lo: Math.max(0, p - margin),
      hi: Math.min(1, p + margin),
      degenerate: p === 0 || p === 1,
    };
  });

  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 4 })
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

  setMode(m: 'mean' | 'proportion') { this.mode.set(m); }
  setSampleMean(v: number) { this.sampleMean.set(this.clampNum(v, -1e12, 1e12)); }
  setStdDev(v: number) { this.stdDev.set(this.clampNum(v, 0, 1e12)); }
  setN(v: number) { this.n.set(Math.max(0, Math.round(v) || 0)); }
  setProp(v: number) { this.prop.set(this.clampNum(v, 0, 1)); }
  setPropN(v: number) { this.propN.set(Math.max(0, Math.round(v) || 0)); }
  setConfidence(v: number) { this.confidence.set(v); }

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
