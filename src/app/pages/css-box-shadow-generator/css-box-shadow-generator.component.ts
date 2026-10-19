import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgStyle } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

@Component({
  selector: 'app-css-box-shadow-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-box-shadow-generator.component.html',
  styleUrl: './css-box-shadow-generator.component.scss',
})
export class CssBoxShadowGeneratorComponent implements OnDestroy {
  readonly slug = 'css-box-shadow-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-border-radius-generator', 'css-glassmorphism-generator', 'css-background-pattern-generator', 'css-checkbox-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly offsetX = signal(0);
  readonly offsetY = signal(8);
  readonly blur = signal(24);
  readonly spread = signal(0);
  readonly color = signal('#000000');
  readonly opacity = signal(25);
  readonly inset = signal(false);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly cssCode = computed(() => {
    const { r, g, b } = hexToRgb(this.color());
    const a = Math.round((this.opacity() / 100) * 100) / 100;
    const inset = this.inset() ? 'inset ' : '';
    return `box-shadow: ${inset}${this.offsetX()}px ${this.offsetY()}px ${this.blur()}px ${this.spread()}px rgba(${r}, ${g}, ${b}, ${a});`;
  });

  readonly previewStyle = computed(() => ({ 'box-shadow': this.cssCode().replace('box-shadow: ', '').replace(';', '') }));

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

  setOffsetX(v: number) { this.offsetX.set(this.clampNum(v, -60, 60)); }
  setOffsetY(v: number) { this.offsetY.set(this.clampNum(v, -60, 60)); }
  setBlur(v: number) { this.blur.set(this.clampNum(v, 0, 100)); }
  setSpread(v: number) { this.spread.set(this.clampNum(v, -40, 40)); }
  setOpacity(v: number) { this.opacity.set(this.clampNum(v, 0, 100)); }

  async copyCss() {
    try {
      await navigator.clipboard.writeText(this.cssCode()).catch(() => undefined);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  downloadCss() {
    const blob = new Blob([`.elevated {\n  ${this.cssCode()}\n}`], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'box-shadow.css';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
