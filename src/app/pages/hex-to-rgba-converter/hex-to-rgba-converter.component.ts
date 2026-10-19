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
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return null;
  return '#' + s;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

@Component({
  selector: 'app-hex-to-rgba-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './hex-to-rgba-converter.component.html',
  styleUrl: './hex-to-rgba-converter.component.scss',
})
export class HexToRgbaConverterComponent implements OnDestroy {
  readonly slug = 'hex-to-rgba-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['color-code-converter', 'color-picker', 'color-blender', 'color-contrast-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly hexInput = signal('#4f46e5');
  readonly opacity = signal(100);
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
    const hex = normHex(this.hexInput());
    if (!hex) {
      return { ok: false as const, rgba: '', hex8: '', rgb: '', alpha: 0, preview: '#000000' };
    }
    const rgb = hexToRgb(hex);
    let alpha: number;
    if (hex.length === 9) alpha = Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 100) / 100;
    else alpha = Math.round((this.opacity() / 100) * 100) / 100;
    const hex8 = '#' + [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    return {
      ok: true as const,
      rgba: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`,
      hex8,
      rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
      alpha,
      preview: '#' + [rgb[0], rgb[1], rgb[2]].map((v) => v.toString(16).padStart(2, '0')).join(''),
    };
  });

  readonly alphaText = computed(() =>
    this.result().alpha.toLocaleString(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

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

  setHex(v: string) { this.hexInput.set(v); }
  setOpacity(v: number) { this.opacity.set(this.clampNum(v, 0, 100)); }

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
