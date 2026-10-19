import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';


@Component({
  selector: 'app-url-encoder-decoder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './url-encoder-decoder.component.html',
  styleUrl: './url-encoder-decoder.component.scss',
})
export class UrlEncoderDecoderComponent implements OnDestroy {
  readonly slug = 'url-encoder-decoder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['number-converter', 'number-to-words-converter', 'length-converter', 'weight-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly text = signal('');
  readonly rawText = signal('');
  readonly mode = signal<'encode' | 'decode'>('encode');
  readonly copied = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly output = computed(() => {
    const input = this.text();
    if (!input) return '';
    try {
      return this.mode() === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
    } catch {
      return '';
    }
  });

  readonly failed = computed(() => this.text().length > 0 && this.output() === '');
  readonly inputBytes = computed(() => new TextEncoder().encode(this.text()).length);
  readonly outputBytes = computed(() => new TextEncoder().encode(this.output()).length);

  setMode(m: 'encode' | 'decode') {
    this.mode.set(m);
    this.copied.set(false);
  }

  setText(v: string) {
    this.rawText.set(v);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(v), 250);
  }

  swap() {
    const out = this.output();
    if (this.text() === '' && out === '') return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set(out);
    this.text.set(out);
    this.mode.update((m) => (m === 'encode' ? 'decode' : 'encode'));
    this.copied.set(false);
  }

  async copy() {
    const out = this.output();
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = out;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
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

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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