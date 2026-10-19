import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface InvisibleDef {
  key: string;
  char: string;
}

interface CharInfo {
  key: string;
  code: string;
  name: string;
  usage: string;
}

const INVISIBLES: InvisibleDef[] = [
  { key: 'zwsp', char: '\u200B' },
  { key: 'zwnj', char: '\u200C' },
  { key: 'zwj', char: '\u200D' },
  { key: 'wj', char: '\u2060' },
  { key: 'nbsp', char: '\u00A0' },
  { key: 'hangul', char: '\u3164' },
  { key: 'braille', char: '\u2800' },
  { key: 'ogham', char: '\u1680' },
];

@Component({
  selector: 'app-invisible-character',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './invisible-character.component.html',
  styleUrl: './invisible-character.component.scss',
})
export class InvisibleCharacterComponent implements OnDestroy {
  readonly slug = 'invisible-character';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['whitespace-remover', 'binary-to-text-converter', 'line-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly selectedKey = signal('hangul');
  readonly repeat = signal(3);
  readonly copiedKey = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly charList = computed((): CharInfo[] => {
    this.translate.lang();
    const raw = this.lookup('chars');
    return Array.isArray(raw) ? (raw as CharInfo[]) : [];
  });

  readonly built = computed(() => {
    const def = INVISIBLES.find((d) => d.key === this.selectedKey());
    return def ? def.char.repeat(this.repeat()) : '';
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

  charFor(key: string): string {
    return INVISIBLES.find((d) => d.key === key)?.char ?? '';
  }

  setSelectedKey(v: string) {
    this.selectedKey.set(v);
  }
  setRepeat(v: number) {
    this.repeat.set(this.clampNum(v, 1, 50));
  }

  copyChar(key: string) {
    const ch = this.charFor(key);
    if (!ch) return;
    navigator.clipboard.writeText(ch).then(() => {
      this.copiedKey.set(key);
      setTimeout(() => this.copiedKey.set(''), 2000);
    }).catch(() => undefined);
  }

  copyBuilt() {
    const b = this.built();
    if (!b) return;
    navigator.clipboard.writeText(b).then(() => {
      this.copiedKey.set('built');
      setTimeout(() => this.copiedKey.set(''), 2000);
    }).catch(() => undefined);
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
    return Math.min(max, Math.max(min, Math.round(v)));
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
