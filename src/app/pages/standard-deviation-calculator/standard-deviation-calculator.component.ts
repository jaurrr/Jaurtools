import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-standard-deviation-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './standard-deviation-calculator.component.html',
  styleUrl: './standard-deviation-calculator.component.scss',
})
export class StandardDeviationCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt(this.mainSd()));
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

  readonly slug = 'standard-deviation-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['statistics-calculator', 'z-score-calculator', 'sample-size-calculator', 'scientific-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rawText = signal('2, 4, 4, 4, 5, 5, 7, 9');
  readonly kind = signal<'population' | 'sample'>('population');

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

  readonly count = computed(() => this.parsed().nums.length);

  readonly mean = computed(() => {
    const nums = this.parsed().nums;
    if (!nums.length) return NaN;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  });

  private readonly sumSq = computed(() => {
    const nums = this.parsed().nums;
    const m = this.mean();
    if (!nums.length) return NaN;
    return nums.reduce((a, x) => a + (x - m) ** 2, 0);
  });

  readonly popVariance = computed(() => {
    const n = this.count();
    return n > 0 ? this.sumSq() / n : NaN;
  });

  readonly sampleVariance = computed(() => {
    const n = this.count();
    return n > 1 ? this.sumSq() / (n - 1) : NaN;
  });

  readonly popSd = computed(() => Math.sqrt(this.popVariance()));
  readonly sampleSd = computed(() => Math.sqrt(this.sampleVariance()));

  readonly mainSd = computed(() =>
    this.kind() === 'population' ? this.popSd() : this.sampleSd()
  );

  readonly mainVar = computed(() =>
    this.kind() === 'population' ? this.popVariance() : this.sampleVariance()
  );

  readonly min = computed(() => {
    const nums = this.parsed().nums;
    return nums.length ? Math.min(...nums) : NaN;
  });

  readonly max = computed(() => {
    const nums = this.parsed().nums;
    return nums.length ? Math.max(...nums) : NaN;
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
  setKind(k: 'population' | 'sample') { this.kind.set(k); }

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
