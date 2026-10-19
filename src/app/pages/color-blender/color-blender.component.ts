import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

function normHex(v: string): string | null {
  let s = v.trim().toLowerCase();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return '#' + s;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + p(r) + p(g) + p(b);
}

@Component({
  selector: 'app-color-blender',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './color-blender.component.html',
  styleUrl: './color-blender.component.scss',
})
export class ColorBlenderComponent implements OnDestroy {
  readonly slug = 'color-blender';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['color-blender', 'complementary-color', 'analogous-color-scheme', 'color-code-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly colorA = signal('#ff0000');
  readonly colorAText = signal('#ff0000');
  readonly colorB = signal('#0000ff');
  readonly colorBText = signal('#0000ff');
  readonly ratio = signal(50);
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
    const a = normHex(this.colorA()) ?? '#ff0000';
    const b = normHex(this.colorB()) ?? '#0000ff';
    const t = this.ratio() / 100;
    const ra = hexToRgb(a), rb = hexToRgb(b);
    const r = ra[0] * (1 - t) + rb[0] * t;
    const g = ra[1] * (1 - t) + rb[1] * t;
    const bl = ra[2] * (1 - t) + rb[2] * t;
    return {
      hex: rgbToHex(r, g, bl),
      rgb: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)})`,
      colorA: a,
      colorB: b,
      ratioA: 100 - this.ratio(),
      ratioB: this.ratio(),
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

  setColorA(v: string) { this.colorA.set(v); this.colorAText.set(v); }
  setColorAText(v: string) {
    this.colorAText.set(v);
    if (normHex(v)) this.colorA.set(normHex(v) as string);
  }
  setColorB(v: string) { this.colorB.set(v); this.colorBText.set(v); }
  setColorBText(v: string) {
    this.colorBText.set(v);
    if (normHex(v)) this.colorB.set(normHex(v) as string);
  }
  setRatio(v: number) { this.ratio.set(this.clampNum(v, 0, 100)); }

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
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
