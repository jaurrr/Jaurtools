import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PatternType = 'arithmetic' | 'geometric' | 'fibonacci' | 'triangular' | 'squares' | 'cubes';

@Component({
  selector: 'app-number-sequence-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './number-sequence-calculator.component.html',
  styleUrl: './number-sequence-calculator.component.scss',
})
export class NumberSequenceCalculatorComponent implements OnDestroy {
  readonly slug = 'number-sequence-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['generate-list-of-numbers', 'filter-numbers', 'min-max-of-a-list', 'mean-median-mode-range-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('3, 7, 11, 15');

  private jsonLdEl: HTMLScriptElement | null = null;

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

  private approx(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-9;
  }

  readonly analysis = computed(() => {
    this.translate.lang();
    const p = this.parsed();
    if (p.length < 3) return null;
    const L = (k: string) => {
      const raw = (this.translate.t as unknown as (x: string) => unknown)(`${this.slug}.labels.${k}`);
      return typeof raw === 'string' ? raw : k;
    };
    const diffs = p.slice(1).map((v, i) => v - p[i]);
    if (diffs.every((d) => this.approx(d, diffs[0]))) {
      const d = diffs[0];
      const next = [1, 2, 3].map((k) => p[p.length - 1] + d * k);
      return { type: 'arithmetic' as PatternType, detail: `${L('detailDiff')}: ${d}`, formula: `a(n) = ${p[0]} + (n-1) x ${d}`, next };
    }
    if (p.every((v) => v !== 0)) {
      const ratios = p.slice(1).map((v, i) => v / p[i]);
      if (ratios.every((r) => this.approx(r, ratios[0]))) {
        const r = ratios[0];
        const next = [1, 2, 3].map((k) => p[p.length - 1] * Math.pow(r, k));
        return { type: 'geometric' as PatternType, detail: `${L('detailRatio')}: ${r}`, formula: `a(n) = ${p[0]} x ${r}^(n-1)`, next };
      }
    }
    let fib = true;
    for (let i = 2; i < p.length; i++) {
      if (!this.approx(p[i], p[i - 1] + p[i - 2])) { fib = false; break; }
    }
    if (fib) {
      const next = [p[p.length - 1] + p[p.length - 2]];
      next.push(next[0] + p[p.length - 1]);
      next.push(next[1] + next[0]);
      return { type: 'fibonacci' as PatternType, detail: L('detailFib'), formula: 'a(n) = a(n-1) + a(n-2)', next };
    }
    const triStart = this.triStart(p);
    if (triStart !== null) {
      const next = [1, 2, 3].map((k) => this.triNum(triStart + p.length - 1 + k));
      return { type: 'triangular' as PatternType, detail: L('detailTri'), formula: 'a(n) = n(n+1)/2', next };
    }
    const sqStart = this.powerStart(p, 2);
    if (sqStart !== null) {
      const next = [1, 2, 3].map((k) => Math.pow(sqStart + p.length - 1 + k, 2));
      return { type: 'squares' as PatternType, detail: L('detailSq'), formula: 'a(n) = n^2', next };
    }
    const cbStart = this.powerStart(p, 3);
    if (cbStart !== null) {
      const next = [1, 2, 3].map((k) => Math.pow(cbStart + p.length - 1 + k, 3));
      return { type: 'cubes' as PatternType, detail: L('detailCube'), formula: 'a(n) = n^3', next };
    }
    return null;
  });

  private triNum(n: number): number { return (n * (n + 1)) / 2; }

  private triStart(p: number[]): number | null {
    for (let s = 1; s <= 50; s++) {
      let ok = true;
      for (let i = 0; i < p.length; i++) {
        if (!this.approx(p[i], this.triNum(s + i))) { ok = false; break; }
      }
      if (ok) return s;
    }
    return null;
  }

  private powerStart(p: number[], exp: number): number | null {
    for (let s = 1; s <= 20; s++) {
      let ok = true;
      for (let i = 0; i < p.length; i++) {
        if (!this.approx(p[i], Math.pow(s + i, exp))) { ok = false; break; }
      }
      if (ok) return s;
    }
    return null;
  }

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
