import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface NamedColor {
  key: string;
  hex: string;
}

function rgbTextOf(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

function normHex(value: string): string | null {
  let h = value.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toUpperCase();
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => {
    const c = Number.isFinite(v) ? Math.min(255, Math.max(0, Math.round(v))) : 0;
    return c.toString(16).padStart(2, '0').toUpperCase();
  };
  return '#' + part(r) + part(g) + part(b);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) { r = c; g = x; }
  else if (hn < 120) { r = x; g = c; }
  else if (hn < 180) { g = c; b = x; }
  else if (hn < 240) { g = x; b = c; }
  else if (hn < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toByte = (v: number) => Math.min(255, Math.max(0, Math.round((v + m) * 255)));
  return [toByte(r), toByte(g), toByte(b)];
}

function mixToward(rgb: [number, number, number], target: 0 | 255, percent: number): [number, number, number] {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return [
    rgb[0] + (target - rgb[0]) * p,
    rgb[1] + (target - rgb[1]) * p,
    rgb[2] + (target - rgb[2]) * p,
  ];
}

@Component({
  selector: 'app-rgb-color-codes',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './rgb-color-codes.component.html',
  styleUrl: './rgb-color-codes.component.scss',
})
export class RgbColorCodesComponent implements OnDestroy {
  readonly slug = 'rgb-color-codes';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rgb-channel-splitter', 'rgba-to-hex-converter', 'random-color-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly query = signal('');

  setQuery(v: string) {
    this.query.set(v);
  }

  private readonly COLORS: NamedColor[] = [
    { key: 'red', hex: '#FF0000' },
    { key: 'lime', hex: '#00FF00' },
    { key: 'blue', hex: '#0000FF' },
    { key: 'yellow', hex: '#FFFF00' },
    { key: 'orange', hex: '#FFA500' },
    { key: 'purple', hex: '#800080' },
    { key: 'pink', hex: '#FFC0CB' },
    { key: 'brown', hex: '#A52A2A' },
    { key: 'black', hex: '#000000' },
    { key: 'white', hex: '#FFFFFF' },
    { key: 'gray', hex: '#808080' },
    { key: 'cyan', hex: '#00FFFF' },
    { key: 'magenta', hex: '#FF00FF' },
    { key: 'navy', hex: '#000080' },
    { key: 'teal', hex: '#008080' },
    { key: 'olive', hex: '#808000' },
    { key: 'maroon', hex: '#800000' },
    { key: 'silver', hex: '#C0C0C0' },
    { key: 'gold', hex: '#FFD700' },
    { key: 'tomato', hex: '#FF6347' },
    { key: 'coral', hex: '#FF7F50' },
    { key: 'indigo', hex: '#4B0082' },
    { key: 'violet', hex: '#EE82EE' },
    { key: 'skyblue', hex: '#87CEEB' },
  ];

  colorName(c: NamedColor): string {
    const n = this.t('labels.colors.' + c.key);
    return n ? n : c.key;
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.COLORS.filter((c) => {
      if (!q) return true;
      return (
        this.colorName(c).toLowerCase().includes(q) ||
        c.key.includes(q) ||
        c.hex.toLowerCase().includes(q)
      );
    }).map((c) => ({ key: c.key, hex: c.hex, name: this.colorName(c), rgb: rgbTextOf(c.hex) }));
  });

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  readonly copiedHex = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  copyHex(hex: string): void {
    const done = () => {
      this.copiedHex.set(hex);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedHex.set(null), 1500);
    };
    try {
      const nav = window.navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } };
      if (nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(hex).then(done, done);
      } else {
        done();
      }
    } catch {
      done();
    }
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
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
    }).replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
