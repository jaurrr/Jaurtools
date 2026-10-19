import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sort-numbers',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sort-numbers.component.html',
  styleUrl: './sort-numbers.component.scss',
})
export class SortNumbersComponent implements OnDestroy {
  readonly slug = 'sort-numbers';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['statistics-calculator', 'standard-deviation-calculator', 'scientific-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rawText = signal('42, 7, 19, 3, 88, 15');
  readonly order = signal<'asc' | 'desc'>('asc');
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
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

  readonly sorted = computed(() => {
    const arr = [...this.parsed().nums];
    arr.sort((a, b) => (this.order() === 'asc' ? a - b : b - a));
    return arr;
  });

  readonly sortedText = computed(() =>
    this.sorted().map((n) => String(parseFloat(n.toPrecision(12)))).join(', ')
  );

  readonly count = computed(() => this.parsed().nums.length);
  readonly smallest = computed(() =>
    this.count() ? Math.min(...this.parsed().nums) : NaN
  );
  readonly largest = computed(() =>
    this.count() ? Math.max(...this.parsed().nums) : NaN
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

  setRawText(v: string) { this.rawText.set(v.slice(0, 20000)); }
  setOrder(o: 'asc' | 'desc') { this.order.set(o); }

  async copyResult() {
    const text = this.sortedText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = text;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
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
