import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Direction = 'decode' | 'encode';

@Component({
  selector: 'app-binary-to-text-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './binary-to-text-converter.component.html',
  styleUrl: './binary-to-text-converter.component.scss',
})
export class BinaryToTextConverterComponent implements OnDestroy {
  readonly slug = 'binary-to-text-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['case-converter', 'line-counter', 'invisible-character'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly direction = signal<Direction>('decode');
  readonly input = signal('');
  readonly rawInput = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly error = computed(() => {
    if (this.direction() !== 'decode') return '';
    const raw = this.input().trim();
    if (raw === '') return '';
    const groups = raw.split(/\s+/);
    const bad = groups.filter((g) => !/^[01]{8}$/.test(g));
    if (bad.length === 0) return '';
    return this.t('labels.invalidError').replace('{n}', String(bad.length));
  });

  readonly output = computed(() => {
    if (this.direction() === 'encode') {
      return this.input()
        .split('')
        .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, '0'))
        .join(' ');
    }
    if (this.error()) return '';
    return this.input()
      .trim()
      .split(/\s+/)
      .filter((g) => g !== '')
      .map((g) => String.fromCharCode(parseInt(g, 2)))
      .join('');
  });

  readonly statCount = computed(() => {
    if (this.direction() === 'encode') {
      return this.input().length;
    }
    return this.input().trim() === '' ? 0 : this.input().trim().split(/\s+/).length;
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

  setDirection(d: Direction) {
    this.direction.set(d);
  }
  setInput(v: string) {
    this.rawInput.set(v);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.input.set(v), 250);
  }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawInput.set('');
    this.input.set('');
  }
  swap() {
    const out = this.output();
    if (this.input() === '' && out === '') return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawInput.set(out);
    this.input.set(out);
    this.direction.update((d) => (d === 'decode' ? 'encode' : 'decode'));
  }

  copy() {
    if (!this.output()) return;
    navigator.clipboard.writeText(this.output()).then(() => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1600);
    }).catch(() => undefined);
  }

  download() {
    if (!this.output()) return;
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = this.direction() === 'decode' ? 'decoded-text.txt' : 'binary.txt';
    a.click();
    URL.revokeObjectURL(url);
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
