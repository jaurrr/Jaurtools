import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-unicode-encoder-decoder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './unicode-encoder-decoder.component.html',
  styleUrl: './unicode-encoder-decoder.component.scss',
})
export class UnicodeEncoderDecoderComponent implements OnDestroy {
  readonly slug = 'unicode-encoder-decoder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['text-to-image-converter', 'svg-editor', 'exif-viewer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'encode' | 'decode'>('encode');
  readonly input = signal('Hello, world!');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private encodeText(text: string): string {
    let out = '';
    for (const ch of text) {
      let cp = ch.codePointAt(0) ?? 0;
      if (cp <= 0xffff) {
        out += '\\u' + cp.toString(16).padStart(4, '0');
      } else {
        cp -= 0x10000;
        const high = 0xd800 + (cp >> 10);
        const low = 0xdc00 + (cp & 0x3ff);
        out += '\\u' + high.toString(16).padStart(4, '0') + '\\u' + low.toString(16).padStart(4, '0');
      }
    }
    return out;
  }

  private decodeText(text: string): string {
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  readonly output = computed(() =>
    this.mode() === 'encode' ? this.encodeText(this.input()) : this.decodeText(this.input())
  );

  readonly escapeCount = computed(() => (this.output().match(/\\u/g) ?? []).length);

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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  setMode(m: 'encode' | 'decode') {
    this.mode.set(m);
  }

  setInput(v: string) {
    this.input.set(v);
  }

  swap() {
    this.input.set(this.output());
    this.setMode(this.mode() === 'encode' ? 'decode' : 'encode');
  }

  copyOutput() {
    const text = this.output();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  private fallbackCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
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
