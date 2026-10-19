import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Parsed {
  ok: boolean;
  r: number; g: number; b: number; a: number;
}

function parseColor(v: string): Parsed {
  const bad: Parsed = { ok: false, r: 0, g: 0, b: 0, a: 1 };
  let s = v.trim().toLowerCase();
  if (!s) return bad;
  let m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    let a = 1;
    if (h.length === 8) a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
    return { ok: true, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/);
  if (m) {
    const r = Math.min(255, parseInt(m[1], 10));
    const g = Math.min(255, parseInt(m[2], 10));
    const b = Math.min(255, parseInt(m[3], 10));
    const a = m[4] === undefined ? 1 : Math.min(1, Math.max(0, parseFloat(m[4])));
    return { ok: true, r, g, b, a };
  }
  m = s.match(/^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*([0-9.]+)\s*)?\)$/);
  if (m) {
    let h = parseFloat(m[1]) % 360;
    if (h < 0) h += 360;
    const sat = Math.min(1, parseFloat(m[2]) / 100);
    const li = Math.min(1, parseFloat(m[3]) / 100);
    const rgb = hslToRgb(h, sat, li);
    const a = m[4] === undefined ? 1 : Math.min(1, Math.max(0, parseFloat(m[4])));
    return { ok: true, r: rgb[0], g: rgb[1], b: rgb[2], a };
  }
  return bad;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + mm) * 255), Math.round((g + mm) * 255), Math.round((b + mm) * 255)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return [h, s, l];
}

@Component({
  selector: 'app-color-code-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './color-code-converter.component.html',
  styleUrl: './color-code-converter.component.scss',
})
export class ColorCodeConverterComponent implements OnDestroy {
  readonly slug = 'color-code-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['hex-to-rgba-converter', 'color-picker', 'color-contrast-checker', 'color-blender'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal('#4f46e5');
  readonly copied = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const p = parseColor(this.input());
    if (!p.ok) {
      return { ok: false as const, hex: '', rgb: '', rgba: '', hsl: '', hsv: '', cmyk: '', preview: '#000000' };
    }
    const n = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const hex6 = '#' + [p.r, p.g, p.b].map((v) => n(v).toString(16).padStart(2, '0')).join('');
    const hex = p.a >= 1 ? hex6 : hex6 + Math.round(p.a * 255).toString(16).padStart(2, '0');
    const hsl = rgbToHsl(p.r, p.g, p.b);
    const max = Math.max(p.r, p.g, p.b) / 255;
    const min = Math.min(p.r, p.g, p.b) / 255;
    const delta = max - min;
    const hsvS = max === 0 ? 0 : delta / max;
    const k = 1 - max;
    const cmy = (v: number) => (k >= 1 ? 0 : Math.round(((max - v / 255) / max) * 100));
    return {
      ok: true as const,
      hex,
      rgb: `rgb(${n(p.r)}, ${n(p.g)}, ${n(p.b)})`,
      rgba: `rgba(${n(p.r)}, ${n(p.g)}, ${n(p.b)}, ${p.a})`,
      hsl: `hsl(${Math.round(hsl[0])}, ${Math.round(hsl[1] * 100)}%, ${Math.round(hsl[2] * 100)}%)`,
      hsv: `hsv(${Math.round(hsl[0])}, ${Math.round(hsvS * 100)}%, ${Math.round(max * 100)}%)`,
      cmyk: `cmyk(${cmy(p.r)}%, ${cmy(p.g)}%, ${cmy(p.b)}%, ${Math.round(k * 100)}%)`,
      preview: hex6,
    };
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

  setInput(v: string) { this.input.set(v); }

  copyText(text: string) {
    try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
    this.copied.set(text);
    window.setTimeout(() => { if (this.copied() === text) this.copied.set(''); }, 1500);
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
