import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-mean-median-mode-range-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './mean-median-mode-range-calculator.component.html',
  styleUrl: './mean-median-mode-range-calculator.component.scss',
})
export class MeanMedianModeRangeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.mean() !== null ? this.numFormat().format(this.mean()!) : '—');
  copyMain(): void {
    const text = this.copyText();
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

  readonly slug = 'mean-median-mode-range-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['min-max-of-a-list', 'filter-numbers', 'number-sequence-calculator', 'generate-list-of-numbers'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('2, 4, 4, 5, 9');

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

  readonly sorted = computed(() => [...this.parsed()].sort((a, b) => a - b));

  readonly sum = computed(() => this.parsed().reduce((a, b) => a + b, 0));

  readonly mean = computed(() => {
    const p = this.parsed();
    return p.length === 0 ? null : this.sum() / p.length;
  });

  readonly median = computed(() => {
    const s = this.sorted();
    const n = s.length;
    if (n === 0) return null;
    return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  });

  readonly modes = computed(() => {
    const p = this.parsed();
    if (p.length === 0) return [];
    const freq = new Map<number, number>();
    for (const v of p) freq.set(v, (freq.get(v) ?? 0) + 1);
    const max = Math.max(...freq.values());
    if (max <= 1) return [];
    return [...freq.entries()].filter(([, c]) => c === max).map(([v]) => v).sort((a, b) => a - b);
  });

  readonly range = computed(() => {
    const s = this.sorted();
    return s.length === 0 ? null : s[s.length - 1] - s[0];
  });

  readonly min = computed(() => {
    const s = this.sorted();
    return s.length === 0 ? null : s[0];
  });

  readonly max = computed(() => {
    const s = this.sorted();
    return s.length === 0 ? null : s[s.length - 1];
  });

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
