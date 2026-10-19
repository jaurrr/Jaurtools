import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Rule = 'even' | 'odd' | 'prime' | 'divisible' | 'greater' | 'less' | 'unique' | 'sortAsc' | 'sortDesc';

@Component({
  selector: 'app-filter-numbers',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './filter-numbers.component.html',
  styleUrl: './filter-numbers.component.scss',
})
export class FilterNumbersComponent implements OnDestroy {
  readonly slug = 'filter-numbers';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['generate-list-of-numbers', 'min-max-of-a-list', 'mean-median-mode-range-calculator', 'number-base-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rules: Rule[] = ['even', 'odd', 'prime', 'divisible', 'greater', 'less', 'unique', 'sortAsc', 'sortDesc'];
  readonly inputText = signal('12, 7, 30, 5, 18, 3');
  readonly rule = signal<Rule>('even');
  readonly param = signal(3);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed(() => {
    return this.inputText()
      .split(/[\s,;|\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((v) => Number.isFinite(v));
  });

  readonly needsParam = computed(() => this.rule() === 'divisible' || this.rule() === 'greater' || this.rule() === 'less');

  readonly filtered = computed(() => {
    const nums = this.parsed();
    const r = this.rule();
    const p = this.param();
    switch (r) {
      case 'even': return nums.filter((v) => Number.isInteger(v) && v % 2 === 0);
      case 'odd': return nums.filter((v) => Number.isInteger(v) && Math.abs(v % 2) === 1);
      case 'prime': return nums.filter((v) => this.isPrime(v));
      case 'divisible': return p !== 0 ? nums.filter((v) => v % p === 0) : [];
      case 'greater': return nums.filter((v) => v > p);
      case 'less': return nums.filter((v) => v < p);
      case 'unique': return [...new Set(nums)];
      case 'sortAsc': return [...nums].sort((a, b) => a - b);
      case 'sortDesc': return [...nums].sort((a, b) => b - a);
    }
  });

  readonly removedCount = computed(() => this.parsed().length - this.filtered().length);

  readonly numFormat = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 6 })
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

  setInputText(v: string) { this.inputText.set(v.slice(0, 50000)); }
  setRule(r: Rule) { this.rule.set(r); }
  setParam(v: number) { this.param.set(Number.isFinite(v) ? v : 0); }

  copyResult() {
    const text = this.filtered().join(', ');
    try {
      void navigator.clipboard?.writeText(text);
    } catch { /* clipboard unavailable */ }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  private isPrime(v: number): boolean {
    if (!Number.isInteger(v) || v < 2) return false;
    if (v === 2) return true;
    if (v % 2 === 0) return false;
    for (let i = 3; i * i <= v; i += 2) {
      if (v % i === 0) return false;
    }
    return true;
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
