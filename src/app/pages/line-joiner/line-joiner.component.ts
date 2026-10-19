import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Preset = 'comma' | 'space' | 'semicolon' | 'pipe' | 'newline' | 'custom';

const PRESET_VALUES: Record<Exclude<Preset, 'custom'>, string> = {
  comma: ', ',
  space: ' ',
  semicolon: '; ',
  pipe: ' | ',
  newline: '\n',
};

@Component({
  selector: 'app-line-joiner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './line-joiner.component.html',
  styleUrl: './line-joiner.component.scss',
})
export class LineJoinerComponent implements OnDestroy {
  readonly slug = 'line-joiner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['add-text-to-each-line', 'line-counter', 'find-and-replace'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly preset = signal<Preset>('comma');
  readonly customDelimiter = signal('');
  readonly skipEmpty = signal(true);
  readonly quoteLines = signal(false);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly delimiter = computed(() => {
    const p = this.preset();
    return p === 'custom' ? this.customDelimiter() : PRESET_VALUES[p];
  });

  readonly output = computed(() => {
    let lines = this.text().split('\n');
    if (this.skipEmpty()) lines = lines.filter((l) => l.trim() !== '');
    if (this.quoteLines()) lines = lines.map((l) => `"${l.replace(/"/g, '\\"')}"`);
    return lines.join(this.delimiter());
  });

  readonly lineCount = computed(() => {
    let lines = this.text().split('\n');
    if (this.skipEmpty()) lines = lines.filter((l) => l.trim() !== '');
    return this.text() === '' ? 0 : lines.length;
  });

  readonly outChars = computed(() => this.output().length);

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

  setText(v: string) {
    const val = (v);
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  setPreset(p: Preset) {
    this.preset.set(p);
  }
  setCustomDelimiter(v: string) {
    this.customDelimiter.set(v);
  }
  toggleSkipEmpty() {
    this.skipEmpty.update((v) => !v);
  }
  toggleQuoteLines() {
    this.quoteLines.update((v) => !v);
  }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  copy() {
    if (!this.output()) return;
    navigator.clipboard.writeText(this.output()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  download() {
    if (!this.output()) return;
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'joined-lines.txt';
    a.click();
    URL.revokeObjectURL(url);
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
