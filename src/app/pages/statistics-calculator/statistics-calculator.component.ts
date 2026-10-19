import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-statistics-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './statistics-calculator.component.html',
  styleUrl: './statistics-calculator.component.scss',
})
export class StatisticsCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt(this.mean()));
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

  readonly slug = 'statistics-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['standard-deviation-calculator', 'z-score-calculator', 'sample-size-calculator', 'sort-numbers'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rawText = signal('12, 15, 18, 22, 22, 25, 30');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed(() => {
    const parts = this.rawText().split(/[\s,;|]+/).filter((p) => p.length > 0);
    const nums: number[] = [];
    let ignored = 0;
    for (const p of parts) {
      const v = parseFloat(p);
      if (Number.isFinite(v)) nums.push(v);
      else ignored++;
    }
    return { nums, ignored };
  });

  readonly sorted = computed(() => [...this.parsed().nums].sort((a, b) => a - b));

  readonly count = computed(() => this.sorted().length);

  readonly sum = computed(() => this.sorted().reduce((a, b) => a + b, 0));

  readonly mean = computed(() => {
    const n = this.count();
    return n > 0 ? this.sum() / n : NaN;
  });

  readonly median = computed(() => {
    const s = this.sorted();
    const n = s.length;
    if (!n) return NaN;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  });

  readonly modes = computed(() => {
    const s = this.sorted();
    if (!s.length) return [] as number[];
    const freq = new Map<string, { v: number; c: number }>();
    for (const v of s) {
      const k = String(v);
      const e = freq.get(k);
      if (e) e.c++;
      else freq.set(k, { v, c: 1 });
    }
    let best = 1;
    for (const e of freq.values()) best = Math.max(best, e.c);
    if (best === 1) return [] as number[];
    return [...freq.values()].filter((e) => e.c === best).map((e) => e.v).sort((a, b) => a - b);
  });

  readonly min = computed(() => {
    const s = this.sorted();
    return s.length ? s[0] : NaN;
  });

  readonly max = computed(() => {
    const s = this.sorted();
    return s.length ? s[s.length - 1] : NaN;
  });

  readonly range = computed(() => this.max() - this.min());

  private readonly sumSq = computed(() => {
    const s = this.sorted();
    const m = this.mean();
    if (!s.length) return NaN;
    return s.reduce((a, x) => a + (x - m) ** 2, 0);
  });

  readonly sampleVariance = computed(() => {
    const n = this.count();
    return n > 1 ? this.sumSq() / (n - 1) : NaN;
  });

  readonly sampleSd = computed(() => Math.sqrt(this.sampleVariance()));

  readonly popVariance = computed(() => {
    const n = this.count();
    return n > 0 ? this.sumSq() / n : NaN;
  });

  readonly popSd = computed(() => Math.sqrt(this.popVariance()));

  private quantile(q: number): number {
    const s = this.sorted();
    const n = s.length;
    if (!n) return NaN;
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return s[base] + rest * ((s[base + 1] ?? s[base]) - s[base]);
  }

  readonly q1 = computed(() => this.quantile(0.25));
  readonly q3 = computed(() => this.quantile(0.75));
  readonly iqr = computed(() => this.q3() - this.q1());

  readonly modeText = computed(() => {
    const m = this.modes();
    if (!this.count()) return '–';
    if (!m.length) return this.t('labels.noMode');
    return m.map((v) => this.fmt(v)).join(', ');
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

  fmt(v: number): string {
    if (!Number.isFinite(v)) return '–';
    return String(parseFloat(v.toPrecision(8)));
  }

  setRawText(v: string) { this.rawText.set(v.slice(0, 20000)); }

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
