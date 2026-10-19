import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface StyleMap {
  id: string;
  upper: number;
  lower: number;
  digits: number;
  upperFix: Record<number, number>;
  lowerFix: Record<number, number>;
}

const STYLES: StyleMap[] = [
  { id: 'bold', upper: 0x1d400, lower: 0x1d41a, digits: 0x1d7ce, upperFix: {}, lowerFix: {} },
  { id: 'italic', upper: 0x1d434, lower: 0x1d44e, digits: 0, upperFix: {}, lowerFix: {} },
  { id: 'boldItalic', upper: 0x1d468, lower: 0x1d482, digits: 0, upperFix: {}, lowerFix: {} },
  { id: 'script', upper: 0x1d4d0, lower: 0x1d4ea, digits: 0,
    upperFix: { 1: 0x212c, 4: 0x2130, 5: 0x2131, 7: 0x210b, 8: 0x2110, 11: 0x2112, 12: 0x2133, 17: 0x211b },
    lowerFix: { 6: 0x210a } },
  { id: 'fraktur', upper: 0x1d504, lower: 0x1d51e, digits: 0,
    upperFix: { 2: 0x212d, 7: 0x210c, 8: 0x2111, 17: 0x211c, 25: 0x2128 },
    lowerFix: {} },
  { id: 'monospace', upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6, upperFix: {}, lowerFix: {} },
  { id: 'doubleStruck', upper: 0x1d538, lower: 0x1d552, digits: 0x1d7d8,
    upperFix: { 2: 0x2102, 7: 0x210d, 13: 0x2115, 15: 0x2119, 16: 0x211a, 17: 0x211d, 25: 0x2124 },
    lowerFix: {} },
  { id: 'circled', upper: 0x24b6, lower: 0x24d0, digits: 0,
    upperFix: {}, lowerFix: {} },
];

function styleChar(ch: string, map: StyleMap): string {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 65 && code <= 90) {
    const idx = code - 65;
    return String.fromCodePoint(map.upperFix[idx] ?? map.upper + idx);
  }
  if (code >= 97 && code <= 122) {
    const idx = code - 97;
    return String.fromCodePoint(map.lowerFix[idx] ?? map.lower + idx);
  }
  if (code >= 48 && code <= 57) {
    const idx = code - 48;
    if (map.id === 'circled') return String.fromCodePoint(idx === 0 ? 0x24ea : 0x245f + idx);
    if (map.digits) return String.fromCodePoint(map.digits + idx);
    return ch;
  }
  return ch;
}

@Component({
  selector: 'app-fancy-text-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './fancy-text-generator.component.html',
  styleUrl: './fancy-text-generator.component.scss',
})
export class FancyTextGeneratorComponent implements OnDestroy {
  readonly slug = 'fancy-text-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['nato-phonetic-alphabet-converter', 'text-to-binary-converter', 'reverse-text', 'strip-html-tags'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly copiedId = signal<string | null>(null);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly styled = computed(() => {
    const t = this.text();
    return STYLES.map((s) => ({
      id: s.id,
      preview: [...t].map((ch) => styleChar(ch, s)).join(''),
    }));
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
    const val = (v.slice(0, 500));
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }

  copyStyle(id: string, preview: string) {
    if (!preview) return;
    navigator.clipboard.writeText(preview).then(() => {
      this.copiedId.set(id);
      setTimeout(() => this.copiedId.set(null), 2000);
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
