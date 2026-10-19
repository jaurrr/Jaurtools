import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-base-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './base-converter.component.html',
  styleUrl: './base-converter.component.scss',
})
export class BaseConverterComponent implements OnDestroy {
  readonly slug = 'base-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['hex-calculator', 'ascii-table', 'base64-encoder-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly num = signal('255');
  readonly fromBase = signal('10');
  readonly toBase = signal('16');
  readonly bases = ['2', '8', '10', '16', '32', '36'];
  readonly parsed = computed(() => {
    const raw = this.num().trim().toUpperCase().replace(/^0+(?=[0-9A-Z])/, '');
    const fb = parseInt(this.fromBase(), 10);
    if (!/^[0-9A-Z]+$/.test(raw)) return null;
    const v = parseInt(raw, fb);
    if (Number.isNaN(v)) return null;
    if (v.toString(fb).toUpperCase() !== raw) return null;
    return v;
  });
  readonly out = computed(() => {
    const v = this.parsed();
    if (v === null) return '';
    return v.toString(parseInt(this.toBase(), 10)).toUpperCase();
  });
  /** One input, every base at once — no need to convert 4 separate times. */
  readonly allFormats = computed(() => {
    const v = this.parsed();
    if (v === null) return [];
    return this.bases.map((b) => ({
      base: b,
      value: v.toString(parseInt(b, 10)).toUpperCase(),
    }));
  });
  readonly copiedBase = signal<string | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  copyBase(base: string, value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.copiedBase.set(base);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedBase.set(null), 1600);
    }).catch(() => undefined);
  }
  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  setNum(v: string) { this.num.set(v); }
  setFromBase(b: string) { this.fromBase.set(b); }
  setToBase(b: string) { this.toBase.set(b); }
  swap() { const f = this.fromBase(); this.fromBase.set(this.toBase()); this.toBase.set(f); }

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
  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
