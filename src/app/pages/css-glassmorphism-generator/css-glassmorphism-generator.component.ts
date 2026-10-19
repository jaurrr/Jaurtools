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
  selector: 'app-css-glassmorphism-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-glassmorphism-generator.component.html',
  styleUrl: './css-glassmorphism-generator.component.scss',
})
export class CssGlassmorphismGeneratorComponent implements OnDestroy {
  readonly slug = 'css-glassmorphism-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-box-shadow-generator', 'css-border-radius-generator', 'css-background-pattern-generator', 'css-clip-path-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly blur = signal(12);
  readonly transparency = signal(20);
  readonly saturation = signal(150);
  readonly borderRadius = signal(16);
  readonly borderOn = signal(true);
  readonly tint = signal('#ffffff');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly tintRgb = computed(() => hexToRgb(this.tint()));
  readonly bgAlpha = computed(() => Math.round((this.transparency() / 100) * 100) / 100);
  readonly borderAlpha = computed(() => Math.round((this.bgAlpha() + 0.2 > 1 ? 1 : this.bgAlpha() + 0.2) * 100) / 100);

  readonly cssCode = computed(() => {
    const { r, g, b } = this.tintRgb();
    const filter = `blur(${this.blur()}px) saturate(${this.saturation()}%)`;
    const border = this.borderOn()
      ? `\n  border: 1px solid rgba(${r}, ${g}, ${b}, ${this.borderAlpha()});`
      : '';
    return (
      `.glass {\n  background: rgba(${r}, ${g}, ${b}, ${this.bgAlpha()});\n` +
      `  backdrop-filter: ${filter};\n  -webkit-backdrop-filter: ${filter};${border}\n` +
      `  border-radius: ${this.borderRadius()}px;\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);\n}`
    );
  });

  readonly previewStyle = computed(() => {
    const { r, g, b } = this.tintRgb();
    const filter = `blur(${this.blur()}px) saturate(${this.saturation()}%)`;
    const style: Record<string, string> = {
      background: `rgba(${r}, ${g}, ${b}, ${this.bgAlpha()})`,
      'backdrop-filter': filter,
      '-webkit-backdrop-filter': filter,
      'border-radius': `${this.borderRadius()}px`,
      'box-shadow': '0 8px 32px rgba(0, 0, 0, 0.1)',
    };
    style['border'] = this.borderOn() ? `1px solid rgba(${r}, ${g}, ${b}, ${this.borderAlpha()})` : '1px solid transparent';
    return style;
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

  setBlur(v: number) { this.blur.set(this.clampNum(v, 0, 30)); }
  setTransparency(v: number) { this.transparency.set(this.clampNum(v, 5, 60)); }
  setSaturation(v: number) { this.saturation.set(this.clampNum(v, 0, 200)); }
  setBorderRadius(v: number) { this.borderRadius.set(this.clampNum(v, 0, 32)); }

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
    const blob = new Blob([this.cssCode()], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'glassmorphism.css';
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
