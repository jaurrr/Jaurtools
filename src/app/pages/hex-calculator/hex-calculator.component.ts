import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-hex-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './hex-calculator.component.html',
  styleUrl: './hex-calculator.component.scss',
})
export class HexCalculatorComponent implements OnDestroy {
  readonly slug = 'hex-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['base-converter', 'ascii-table', 'base64-encoder-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly a = signal('FF');
  readonly b = signal('1');
  readonly op = signal('+');
  readonly ops = ['+', '-', '*', '/'];
  private parseHex(s: string): number | null {
    const t = s.trim();
    if (!/^-?[0-9a-fA-F]+$/.test(t)) return null;
    const v = parseInt(t, 16);
    return Number.isNaN(v) ? null : v;
  }
  readonly valid = computed(() => this.parseHex(this.a()) !== null && this.parseHex(this.b()) !== null);
  readonly decResult = computed(() => {
    const x = this.parseHex(this.a());
    const y = this.parseHex(this.b());
    if (x === null || y === null) return null;
    switch (this.op()) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return y !== 0 ? Math.trunc(x / y) : null;
      default: return null;
    }
  });
  readonly hexResult = computed(() => {
    const d = this.decResult();
    if (d === null) return '';
    return (d < 0 ? '-' : '') + Math.abs(Math.trunc(d)).toString(16).toUpperCase();
  });
  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  setA(v: string) { this.a.set(v); }
  setB(v: string) { this.b.set(v); }
  setOp(o: string) { this.op.set(o); }

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
