import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const CTRL_NAMES = ["NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "TAB", "LF", "VT", "FF", "CR", "SO", "SI", "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"];

@Component({
  selector: 'app-ascii-table',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './ascii-table.component.html',
  styleUrl: './ascii-table.component.scss',
})
export class AsciiTableComponent implements OnDestroy {
  readonly slug = 'ascii-table';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['base64-encoder-decoder', 'html-encoder-decoder', 'base-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly query = signal('');
  readonly charIn = signal('');
  readonly codeIn = signal(65);
  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all: { code: number; char: string; name: string }[] = [];
    for (let i = 0; i < 128; i++) {
      const char = i >= 32 && i < 127 ? String.fromCharCode(i) : '';
      const name = i < 32 ? CTRL_NAMES[i] : i === 32 ? 'Space' : i === 127 ? 'DEL' : char;
      all.push({ code: i, char, name });
    }
    if (!q) return all;
    return all.filter((r) =>
      String(r.code).includes(q) || r.name.toLowerCase().includes(q) || r.char.toLowerCase() === q
    );
  });
  readonly charCode = computed(() => {
    const s = this.charIn();
    return s ? (s.codePointAt(0) ?? -1) : -1;
  });
  readonly codeChar = computed(() => {
    const c = Math.trunc(this.codeIn());
    if (!Number.isFinite(c) || c < 0 || c > 127) return '';
    return c >= 32 && c < 127 ? String.fromCharCode(c) : '';
  });
  setQuery(v: string) { this.query.set(v); }
  setCharIn(v: string) { this.charIn.set(v.slice(0, 2)); }
  setCodeIn(v: number) { this.codeIn.set(Number.isFinite(v) ? Math.trunc(v) : 0); }
  readonly copiedChar = signal('');

  async copyChar(ch: string) {
    try { await navigator.clipboard.writeText(ch).catch(() => undefined); } catch { /* clipboard unavailable */ }
    this.copiedChar.set(ch);
    window.setTimeout(() => this.copiedChar.set(''), 1500);
  }

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
