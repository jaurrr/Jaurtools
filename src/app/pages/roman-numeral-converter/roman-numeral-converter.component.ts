import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type RomanMode = 'num-to-roman' | 'roman-to-num';

const ROMAN_TABLE: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const ROMAN_REGEX =
  /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

@Component({
  selector: 'app-roman-numeral-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './roman-numeral-converter.component.html',
  styleUrl: './roman-numeral-converter.component.scss',
})
export class RomanNumeralConverterComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.converted());
  copyMain(): void {
    const text = String(this.copyText());
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'roman-numeral-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = [
    'root-calculator',
    'rounding-calculator',
    'prime-factorization-calculator',
    'ratio-calculator',
  ];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<RomanMode>('num-to-roman');
  readonly number = signal(2024);
  readonly roman = signal('MMXXIV');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private toRoman(n: number): string {
    let out = '';
    let rest = n;
    for (const [value, symbol] of ROMAN_TABLE) {
      while (rest >= value) {
        out += symbol;
        rest -= value;
      }
    }
    return out;
  }

  private fromRoman(s: string): number | null {
    const clean = s.trim().toUpperCase();
    if (clean === '' || !ROMAN_REGEX.test(clean)) return null;
    const values: Record<string, number> = {
      I: 1,
      V: 5,
      X: 10,
      L: 50,
      C: 100,
      D: 500,
      M: 1000,
    };
    let total = 0;
    for (let i = 0; i < clean.length; i++) {
      const cur = values[clean[i]];
      const next = i + 1 < clean.length ? values[clean[i + 1]] : 0;
      total += cur < next ? -cur : cur;
    }
    return total;
  }

  readonly converted = computed((): string | null => {
    if (this.mode() === 'num-to-roman') {
      const n = Math.floor(this.number());
      if (n < 1 || n > 3999 || !Number.isInteger(this.number())) return null;
      return this.toRoman(n);
    }
    return this.fromRoman(this.roman())?.toString() ?? null;
  });

  readonly breakdown = computed((): string | null => {
    if (this.mode() === 'num-to-roman') {
      const n = Math.floor(this.number());
      if (n < 1 || n > 3999 || !Number.isInteger(this.number())) return null;
      const parts: string[] = [];
      let rest = n;
      for (const [value, symbol] of ROMAN_TABLE) {
        let count = 0;
        while (rest >= value) {
          count++;
          rest -= value;
        }
        if (count > 0) parts.push(count > 1 ? `${count}×${value}=${symbol.repeat(count)}` : `${value}=${symbol}`);
      }
      return parts.join(' + ');
    }
    const v = this.fromRoman(this.roman());
    return v !== null ? this.toRoman(v) : null;
  });

  readonly fmtInt = computed(() => new Intl.NumberFormat(this.locale()));

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

  setMode(m: RomanMode) {
    this.mode.set(m);
  }

  setNumber(v: number) {
    this.number.set(Math.floor(this.clampNum(v, 1, 3999)));
  }

  setRoman(v: string) {
    this.roman.set(v);
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
