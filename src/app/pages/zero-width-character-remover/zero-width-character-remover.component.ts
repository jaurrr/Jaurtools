import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const ZW_CHARS = [
  { id: 'zwsp', char: '​', code: 'U+200B' },
  { id: 'zwnj', char: '‌', code: 'U+200C' },
  { id: 'zwj', char: '‍', code: 'U+200D' },
  { id: 'bom', char: '﻿', code: 'U+FEFF' },
];
// NOTE: the `char` values above are invisible zero-width characters (kept literal on
// purpose so the demo input below contains them). Their escapes: zwsp=\u200B,
// zwnj=\u200C, zwj=\u200D, bom=\uFEFF.

@Component({
  selector: 'app-zero-width-character-remover',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './zero-width-character-remover.component.html',
  styleUrl: './zero-width-character-remover.component.scss',
})
export class ZeroWidthCharacterRemoverComponent implements OnDestroy {
  readonly slug = 'zero-width-character-remover';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['zalgo-text-generator', 'case-converter', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  // Demo input with 4 hidden chars: 'he' + ZWNJ + 'l' + ZWNJ + 'lo, wor' + ZWJ + 'ld' + BOM
  readonly input = signal('he‌l‌lo, wor‍ld﻿');
  readonly rawInput = signal('he‌l‌lo, wor‍ld﻿');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly zwsp = signal(true);
  readonly zwnj = signal(true);
  readonly zwj = signal(true);
  readonly bom = signal(true);
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

  private readonly activeChars = computed(() => {
    const flags: Record<string, boolean> = {
      zwsp: this.zwsp(),
      zwnj: this.zwnj(),
      zwj: this.zwj(),
      bom: this.bom(),
    };
    return ZW_CHARS.filter((c) => flags[c.id]);
  });

  readonly output = computed(() => {
    const active = this.activeChars();
    if (!active.length) return this.input();
    const pattern = new RegExp(`[${active.map((c) => c.char).join('')}]`, 'g');
    return this.input().replace(pattern, '');
  });

  readonly foundCounts = computed(() => {
    const text = this.input();
    return ZW_CHARS.map((c) => {
      let count = 0;
      let i = text.indexOf(c.char);
      while (i !== -1) {
        count++;
        i = text.indexOf(c.char, i + 1);
      }
      return { id: c.id, code: c.code, count };
    });
  });

  readonly removed = computed(() => this.input().length - this.output().length);

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

  labelFor(id: string): string {
    return this.t(`labels.${id}Label`);
  }

  setInput(v: string) {
    const val = (v.slice(0, 100000));
    this.rawInput.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.input.set(val), 250);
  }

  clearAll(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawInput.set('');
    this.input.set('');
  }

  async copyOutput(): Promise<void> {
    const text = this.output();
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
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
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
