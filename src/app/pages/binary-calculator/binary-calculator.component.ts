import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type BinOp = '+' | '-' | '*' | '/';

@Component({
  selector: 'app-binary-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './binary-calculator.component.html',
  styleUrl: './binary-calculator.component.scss',
})
export class BinaryCalculatorComponent implements OnDestroy {
  readonly slug = 'binary-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-calculator', 'big-number-calculator', 'decimal-to-fraction-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly a = signal('1010');
  readonly b = signal('1100');
  readonly op = signal<BinOp>('+');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly validA = computed(() => /^[01]+$/.test(this.a()));
  readonly validB = computed(() => /^[01]+$/.test(this.b()));
  readonly bothValid = computed(() => this.validA() && this.validB());

  readonly result = computed(() => {
    if (!this.bothValid()) return null;
    const x = BigInt('0b' + this.a());
    const y = BigInt('0b' + this.b());
    const o = this.op();
    if (o === '/' && y === 0n) return { divZero: true } as const;
    let q: bigint;
    let r: bigint | null = null;
    switch (o) {
      case '+': q = x + y; break;
      case '-': q = x - y; break;
      case '*': q = x * y; break;
      default: q = x / y; r = x % y; break;
    }
    const toBin = (v: bigint) => (v < 0n ? '-' + (-v).toString(2) : v.toString(2));
    const toHex = (v: bigint) => (v < 0n ? '-' + (-v).toString(16).toUpperCase() : v.toString(16).toUpperCase());
    return {
      divZero: false as const,
      bin: toBin(q),
      dec: q.toString(10),
      hex: toHex(q),
      rem: r === null ? null : toBin(r),
      decA: x.toString(10),
      decB: y.toString(10),
    };
  });

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

  setA(v: string) { this.a.set(v.replace(/[^01]/g, '').slice(0, 128)); }
  setB(v: string) { this.b.set(v.replace(/[^01]/g, '').slice(0, 128)); }
  setOp(o: BinOp) { this.op.set(o); }

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
