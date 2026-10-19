import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-find-and-replace',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './find-and-replace.component.html',
  styleUrl: './find-and-replace.component.scss',
})
export class FindAndReplaceComponent implements OnDestroy {
  readonly slug = 'find-and-replace';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['add-text-to-each-line', 'case-converter', 'line-joiner'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly find = signal('');
  readonly replace = signal('');
  readonly caseSensitive = signal(false);
  readonly wholeWord = signal(false);
  readonly useRegex = signal(false);
  readonly replaceAll = signal(true);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private buildRegex(): RegExp | null {
    const f = this.find();
    if (f === '') return null;
    try {
      let pattern = this.useRegex() ? f : f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (this.wholeWord()) pattern = `\\b(?:${pattern})\\b`;
      const flags = (this.replaceAll() ? 'g' : '') + (this.caseSensitive() ? '' : 'i');
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  readonly regexError = computed(() => {
    if (!this.useRegex() || this.find() === '') return '';
    try {
      new RegExp(this.find());
      return '';
    } catch {
      return this.t('labels.invalidRegexError');
    }
  });

  readonly matchCount = computed(() => {
    const re = this.buildRegex();
    if (!re) return 0;
    const m = this.text().match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    return m ? m.length : 0;
  });

  readonly replacedCount = computed(() =>
    this.replaceAll() ? this.matchCount() : Math.min(1, this.matchCount())
  );

  readonly output = computed(() => {
    const re = this.buildRegex();
    if (!re || this.regexError()) return this.text();
    return this.text().replace(re, this.replace());
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
    const val = (v);
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  setFind(v: string) {
    this.find.set(v);
  }
  setReplace(v: string) {
    this.replace.set(v);
  }
  toggleCaseSensitive() {
    this.caseSensitive.update((v) => !v);
  }
  toggleWholeWord() {
    this.wholeWord.update((v) => !v);
  }
  toggleUseRegex() {
    this.useRegex.update((v) => !v);
  }
  toggleReplaceAll() {
    this.replaceAll.update((v) => !v);
  }
  clear() {
    this.text.set('');
    this.find.set('');
    this.replace.set('');
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
    a.download = 'find-replace.txt';
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
