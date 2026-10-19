import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const MAX_LINES = 5000;

@Component({
  selector: 'app-word-combiner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './word-combiner.component.html',
  styleUrl: './word-combiner.component.scss',
})
export class WordCombinerComponent implements OnDestroy {
  readonly slug = 'word-combiner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['case-converter', 'url-slug-generator', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly listA = signal('red\nblue\ngreen');
  readonly listB = signal('apple\nbanana');
  readonly rawListA = signal('red\nblue\ngreen');
  readonly rawListB = signal('apple\nbanana');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  setListA(v: string): void {
    this.rawListA.set(v);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.listA.set(v), 250);
  }

  setListB(v: string): void {
    this.rawListB.set(v);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.listB.set(v), 250);
  }
  readonly separator = signal<'space' | 'hyphen' | 'underscore' | 'custom'>('space');
  readonly customSep = signal('-');
  readonly prefix = signal('');
  readonly suffix = signal('');
  readonly dedupe = signal(true);
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

  private readonly wordsA = computed(() => this.parseList(this.listA()));
  private readonly wordsB = computed(() => this.parseList(this.listB()));

  readonly totalCombos = computed(() => this.wordsA().length * this.wordsB().length);

  readonly lines = computed(() => {
    const a = this.wordsA();
    const b = this.wordsB();
    const sep =
      this.separator() === 'space'
        ? ' '
        : this.separator() === 'hyphen'
          ? '-'
          : this.separator() === 'underscore'
            ? '_'
            : this.customSep();
    const pre = this.prefix();
    const suf = this.suffix();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of a) {
      for (const y of b) {
        const line = `${pre}${x}${sep}${y}${suf}`;
        if (this.dedupe()) {
          if (seen.has(line)) continue;
          seen.add(line);
        }
        out.push(line);
        if (out.length >= MAX_LINES) return out;
      }
    }
    return out;
  });

  readonly truncated = computed(() => this.totalCombos() > this.lines().length);

  truncatedText(): string {
    return this.t('labels.truncatedNote')
      .replace('{shown}', String(this.lines().length))
      .replace('{total}', String(this.totalCombos()));
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

  clearAll(): void {
    this.listA.set('');
    this.listB.set('');
  }

  async copyLines(): Promise<void> {
    const text = this.lines().join('\n');
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
    const blob = new Blob([this.lines().join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${this.slug}.txt`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseList(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map((w) => w.trim())
      .filter(Boolean);
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
