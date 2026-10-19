import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Symbology = 'code39' | 'itf';

interface Bar {
  x: number;
  w: number;
}

// Code 39: two wide bars out of five encode a number 1-10 (values 1,2,4,7,0).
const C39_WIDE_BARS: Record<number, number[]> = {
  1: [0, 4], 2: [1, 4], 3: [0, 1], 4: [2, 4], 5: [0, 2],
  6: [1, 2], 7: [3, 4], 8: [0, 3], 9: [1, 3], 10: [2, 3],
};
// $, /, +, % : all narrow bars, one narrow space at this position (rest wide).
const C39_NARROW_SPACE: Record<string, number> = { '$': 3, '/': 2, '+': 1, '%': 0 };

// Nine module widths (1 = narrow, 3 = wide), starting with a bar. Null = unsupported char.
function c39Modules(ch: string): number[] | null {
  let n: number;
  let group: number; // position of the single wide space (0-3), groups: digits, A-J, K-T, U-Z+symbols
  if (ch >= '0' && ch <= '9') {
    n = ch === '0' ? 10 : ch.charCodeAt(0) - 48;
    group = 0;
  } else if (ch >= 'A' && ch <= 'Z') {
    const v = ch.charCodeAt(0) - 64;
    group = v <= 10 ? 1 : v <= 20 ? 2 : 3;
    n = group === 1 ? v : group === 2 ? v - 10 : v - 20;
  } else if (ch === '-') { n = 7; group = 3; }
  else if (ch === '.') { n = 8; group = 3; }
  else if (ch === ' ') { n = 9; group = 3; }
  else if (ch === '*') { n = 10; group = 3; }
  else if (ch in C39_NARROW_SPACE) {
    const narrow = C39_NARROW_SPACE[ch];
    const out: number[] = [];
    for (let i = 0; i < 9; i++) out.push(i % 2 === 0 ? 1 : (i >> 1) === narrow ? 1 : 3);
    return out;
  } else {
    return null;
  }
  const wideBars = C39_WIDE_BARS[n];
  const out: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) out.push(wideBars.includes(i >> 1) ? 3 : 1);
    else out.push((i >> 1) === group ? 3 : 1);
  }
  return out;
}

// Interleaved 2 of 5: five elements per digit, two wide.
const ITF_DIGITS: Record<string, number[]> = {
  '0': [1, 1, 3, 3, 1], '1': [3, 1, 1, 1, 3], '2': [1, 3, 1, 1, 3],
  '3': [3, 3, 1, 1, 1], '4': [1, 1, 3, 1, 3], '5': [3, 1, 3, 1, 1],
  '6': [1, 3, 3, 1, 1], '7': [1, 1, 1, 3, 3], '8': [3, 1, 1, 3, 1],
  '9': [1, 3, 1, 3, 1],
};

function itfCheckDigit(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

@Component({
  selector: 'app-barcode-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './barcode-generator.component.html',
  styleUrl: './barcode-generator.component.scss',
})
export class BarcodeGeneratorComponent implements OnDestroy {
  readonly slug = 'barcode-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bulk-qr-code-generator', 'qr-code-scanner', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('JAU2024');
  readonly symbology = signal<Symbology>('code39');
  readonly showText = signal(true);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly error = computed(() => {
    const v = this.text().trim();
    if (v.length === 0) return this.t('labels.errorEmpty');
    if (this.symbology() === 'code39') {
      if (!/^[0-9A-Z \-\.\$\/\+\%]+$/i.test(v)) return this.t('labels.errorChars');
    } else if (!/^\d+$/.test(v)) {
      return this.t('labels.errorDigits');
    }
    return '';
  });

  // Full digit string actually encoded (ITF appends a check digit and pads to even length).
  readonly encodedText = computed(() => {
    if (this.symbology() !== 'itf' || this.error()) return this.text().trim().toUpperCase();
    let d = this.text().trim() + itfCheckDigit(this.text().trim());
    if (d.length % 2 === 1) d = '0' + d;
    return d;
  });

  readonly bars = computed((): { bars: Bar[]; width: number } => {
    const list: Bar[] = [];
    if (this.error()) return { bars: list, width: 0 };
    const modules: number[] = [];
    const push = (m: number[]) => modules.push(...m, 1); // inter-character narrow gap
    if (this.symbology() === 'code39') {
      const data = '*' + this.text().trim().toUpperCase() + '*';
      for (const ch of data) {
        const m = c39Modules(ch);
        if (m) push(m);
      }
    } else {
      const d = this.encodedText();
      push([1, 1, 1, 1]); // start: four narrow elements
      for (let i = 0; i < d.length; i += 2) {
        const b = ITF_DIGITS[d[i]];
        const s = ITF_DIGITS[d[i + 1]];
        for (let k = 0; k < 5; k++) modules.push(b[k], s[k]);
        modules.push(1);
      }
      push([3, 1, 1]); // stop: wide bar, narrow space, narrow bar
    }
    modules.pop(); // trailing gap not needed
    let cursor = 10; // quiet zone: 10 narrow modules each side
    let isBar = true;
    for (const m of modules) {
      if (isBar) list.push({ x: cursor, w: m });
      cursor += m;
      isBar = !isBar;
    }
    return { bars: list, width: cursor + 10 };
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

  setText(v: string): void {
    this.text.set(v);
  }

  setSymbology(v: Symbology): void {
    this.symbology.set(v);
  }

  setShowText(v: boolean): void {
    this.showText.set(v);
  }

  downloadSvg(): void {
    const { bars, width } = this.bars();
    const rects = bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="60" fill="black"/>`).join('');
    const label = this.showText()
      ? `<text x="${width / 2}" y="76" text-anchor="middle" font-family="monospace" font-size="14">${this.escapeXml(this.encodedText())}</text>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 80" width="${width * 4}" height="320">${rects}${label}</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'barcode.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
