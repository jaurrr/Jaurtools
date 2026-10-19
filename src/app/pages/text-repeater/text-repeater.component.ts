import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const MAX_OUTPUT = 1000000;

@Component({
  selector: 'app-text-repeater',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './text-repeater.component.html',
  styleUrl: './text-repeater.component.scss',
})
export class TextRepeaterComponent implements OnDestroy {
  readonly slug = 'text-repeater';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['reverse-text', 'online-text-editor', 'fancy-text-generator', 'teleprompter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly count = signal(10);
  readonly separator = signal<'none' | 'newline' | 'space' | 'comma'>('newline');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly separatorChar = computed(() =>
    this.separator() === 'newline' ? '\n'
    : this.separator() === 'space' ? ' '
    : this.separator() === 'comma' ? ', '
    : ''
  );

  readonly output = computed(() => {
    const t = this.text();
    const n = this.count();
    if (!t || n < 1) return '';
    const sep = this.separatorChar();
    const per = t.length + sep.length;
    const safe = Math.min(n, Math.max(1, Math.floor(MAX_OUTPUT / Math.max(1, per))));
    return Array.from({ length: safe }, () => t).join(sep);
  });

  readonly actualCount = computed(() => {
    const t = this.text();
    const n = this.count();
    if (!t || n < 1) return 0;
    const per = t.length + this.separatorChar().length;
    return Math.min(n, Math.max(1, Math.floor(MAX_OUTPUT / Math.max(1, per))));
  });

  readonly truncated = computed(() => this.actualCount() < this.count());

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
    const val = (v.slice(0, 10000));
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  setCount(v: number) {
    if (!Number.isFinite(v)) v = 10;
    this.count.set(Math.min(100000, Math.max(1, Math.round(v))));
  }
  setSeparator(v: 'none' | 'newline' | 'space' | 'comma') { this.separator.set(v); }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  copyOutput() {
    const out = this.output();
    if (!out) return;
    navigator.clipboard.writeText(out).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  downloadTxt() {
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'repeated-text.txt';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
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
