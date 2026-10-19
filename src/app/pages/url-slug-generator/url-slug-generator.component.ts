import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'in', 'on', 'at', 'to',
  'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'this', 'that',
  'these', 'those', 'as', 'it', 'its', 'into', 'over', 'under',
]);

const EXTRA_MAP: Record<string, string> = {
  'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'å': 'a', 'ł': 'l', 'đ': 'd',
  'þ': 'th', 'ð': 'd', 'ı': 'i', 'ŋ': 'n', 'š': 's', 'ž': 'z', 'č': 'c',
  'ć': 'c', 'ñ': 'n', 'ý': 'y', 'ÿ': 'y',
};

@Component({
  selector: 'app-url-slug-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './url-slug-generator.component.html',
  styleUrl: './url-slug-generator.component.scss',
})
export class UrlSlugGeneratorComponent implements OnDestroy {
  readonly slug = 'url-slug-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['case-converter', 'word-combiner', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly title = signal('The 10 Best Tea Brands in India — 2026 Guide!');
  readonly separator = signal<'hyphen' | 'underscore'>('hyphen');
  readonly lowercase = signal(true);
  readonly removeStopWords = signal(false);
  readonly maxLength = signal(60);
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

  readonly result = computed(() => {
    let s = this.title();
    s = s.normalize('NFD').replace(/\p{M}/gu, '');
    s = s.replace(/[\u00df\u00e6\u0153\u00f8\u00e5\u0142\u0111\u00fe\u00f0\u0131\u014b\u0161\u017e\u010d\u0107\u00f1\u00fd\u00ff]/gi, (ch) => EXTRA_MAP[ch.toLowerCase()] ?? ch);
    if (this.lowercase()) s = s.toLowerCase();
    s = s.replace(/[^a-zA-Z0-9\s-]/g, '');
    let words = s.split(/[\s-]+/).filter(Boolean);
    if (this.removeStopWords()) {
      words = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    }
    const sep = this.separator() === 'hyphen' ? '-' : '_';
    let out = words.join(sep);
    if (out.length > this.maxLength()) {
      out = out.slice(0, this.maxLength());
      const lastSep = out.lastIndexOf(sep);
      if (lastSep > 10) out = out.slice(0, lastSep);
      out = out.replace(new RegExp(`${sep === '-' ? '-' : '_'}+$`), '');
    }
    return out;
  });

  readonly previewUrl = computed(() => `https://example.com/blog/${this.result()}`);

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

  readonly rawTitle = signal('The 10 Best Tea Brands in India — 2026 Guide!');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  setTitle(v: string): void {
    const val = v.slice(0, 500);
    this.rawTitle.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.title.set(val), 250);
  }

  setSeparator(v: 'hyphen' | 'underscore'): void {
    this.separator.set(v);
  }

  setMaxLength(v: number): void {
    if (!Number.isFinite(v)) v = 60;
    this.maxLength.set(Math.min(100, Math.max(10, Math.round(v))));
  }

  async copySlug(): Promise<void> {
    const text = this.result();
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

  downloadTxt(): void {
    const blob = new Blob([this.result()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${this.slug}.txt`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  clearAll(): void {
    this.title.set('');
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
