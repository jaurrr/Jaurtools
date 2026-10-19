import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-text-to-binary-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './text-to-binary-converter.component.html',
  styleUrl: './text-to-binary-converter.component.scss',
})
export class TextToBinaryConverterComponent implements OnDestroy {
  readonly slug = 'text-to-binary-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['nato-phonetic-alphabet-converter', 'token-counter', 'strip-html-tags', 'reverse-text'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  readonly mode = signal<'encode' | 'decode'>('encode');
  readonly separator = signal<'space' | 'newline' | 'none'>('space');
  readonly copied = signal(false);
  readonly copiedRow = signal<string | null>(null);

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

  readonly result = computed(() => {
    const t = this.text();
    if (!t.trim()) return { value: '', error: '', bits: 0 };
    if (this.mode() === 'encode') {
      const bytes = new TextEncoder().encode(t);
      const sep = this.separator() === 'space' ? ' ' : this.separator() === 'newline' ? '\n' : '';
      const value = Array.from(bytes).map((b) => b.toString(2).padStart(8, '0')).join(sep);
      return { value, error: '', bits: bytes.length * 8 };
    }
    const cleaned = t.replace(/[\s,;|]+/g, '');
    if (!/^[01]+$/.test(cleaned)) return { value: '', error: 'invalidChars', bits: 0 };
    if (cleaned.length % 8 !== 0) return { value: '', error: 'notMultipleOf8', bits: cleaned.length };
    const bytes = new Uint8Array(cleaned.length / 8);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleaned.slice(i * 8, i * 8 + 8), 2);
    }
    try {
      const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { value, error: '', bits: cleaned.length };
    } catch {
      return { value: '', error: 'invalidUtf8', bits: cleaned.length };
    }
  });

  readonly output = computed(() => this.result().value);
  readonly errorKey = computed(() => this.result().error);
  readonly bits = computed(() => this.result().bits);
  readonly chars = computed(() => this.text().length);

  /** Bytes behind the current conversion, for the "all formats" panel. */
  readonly formatBytes = computed((): number[] | null => {
    if (this.mode() === 'encode') {
      const t = this.text();
      if (!t) return null;
      return Array.from(new TextEncoder().encode(t));
    }
    const r = this.result();
    if (r.error || !r.value) return null;
    const cleaned = this.text().replace(/[\s,;|]+/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 8) {
      bytes.push(parseInt(cleaned.slice(i, i + 8), 2));
    }
    return bytes;
  });

  /** One input, every format at once: binary / decimal / hex / octal / ASCII. */
  readonly fmtRows = computed(() => {
    const bytes = this.formatBytes();
    if (!bytes || bytes.length === 0 || bytes.length > 4096) return null;
    const pad = (n: number, base: number, len: number) => n.toString(base).padStart(len, '0');
    return [
      { key: 'fmtBinary', value: bytes.map((b) => pad(b, 2, 8)).join(' ') },
      { key: 'fmtDecimal', value: bytes.map((b) => String(b)).join(' ') },
      { key: 'fmtHex', value: bytes.map((b) => pad(b, 16, 2).toUpperCase()).join(' ') },
      { key: 'fmtOctal', value: bytes.map((b) => pad(b, 8, 3)).join(' ') },
      {
        key: 'fmtAscii',
        value: bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join(''),
      },
    ];
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

  setText(v: string) {
    const val = v.slice(0, 200000);
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  setMode(v: 'encode' | 'decode') { this.mode.set(v); }
  setSeparator(v: 'space' | 'newline' | 'none') { this.separator.set(v); }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }
  swap() {
    const out = this.output();
    if (this.text() === '' && out === '') return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set(out);
    this.text.set(out);
    this.mode.update((m) => (m === 'encode' ? 'decode' : 'encode'));
  }

  copyOutput() {
    this.copyValue(this.output(), null);
  }

  copyRow(value: string, key: string) {
    this.copyValue(value, key);
  }

  private copyValue(value: string, rowKey: string | null) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      if (rowKey) {
        this.copiedRow.set(rowKey);
      } else {
        this.copied.set(true);
      }
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copied.set(false);
        this.copiedRow.set(null);
      }, 1600);
    }).catch(() => undefined);
  }

  downloadTxt() {
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = this.mode() === 'encode' ? 'binary.txt' : 'text.txt';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
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
