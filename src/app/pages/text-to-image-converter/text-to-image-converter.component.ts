import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-text-to-image-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './text-to-image-converter.component.html',
  styleUrl: './text-to-image-converter.component.scss',
})
export class TextToImageConverterComponent implements OnDestroy {
  readonly slug = 'text-to-image-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-sprite-generator', 'svg-pattern-generator', 'unicode-encoder-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('Hello, world!');
  readonly fontFamily = signal('Arial, sans-serif');
  readonly fontSize = signal(64);
  readonly bold = signal(true);
  readonly italic = signal(false);
  readonly textColor = signal('#0f172a');
  readonly bgColor = signal('#ffffff');
  readonly transparentBg = signal(false);
  readonly padding = signal(24);
  readonly align = signal<'left' | 'center' | 'right'>('center');
  readonly lineHeight = signal(1.4);
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly imageUrl = signal('');
  readonly dims = signal({ w: 0, h: 0 });

  readonly fonts: string[] = [
    'Arial, sans-serif',
    'Verdana, sans-serif',
    '"Trebuchet MS", sans-serif',
    'Georgia, serif',
    '"Times New Roman", serif',
    '"Courier New", monospace',
    'Impact, sans-serif',
  ];

  private debounceId: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.text();
      this.fontFamily();
      this.fontSize();
      this.bold();
      this.italic();
      this.textColor();
      this.bgColor();
      this.transparentBg();
      this.padding();
      this.align();
      this.lineHeight();
      if (this.debounceId) clearTimeout(this.debounceId);
      this.debounceId = setTimeout(() => this.render(), 250);
    });
  }

  readonly fontLabel = computed(() => this.fontFamily().split(',')[0].replace(/"/g, '').trim());

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

  setText(v: string) { this.text.set(v); }
  setFontFamily(v: string) { this.fontFamily.set(v); }
  setFontSize(v: number) { this.fontSize.set(Math.round(this.clampNum(v, 12, 200))); }
  setBold(v: boolean) { this.bold.set(v); }
  setItalic(v: boolean) { this.italic.set(v); }
  setTextColor(v: string) { this.textColor.set(v); }
  setBgColor(v: string) { this.bgColor.set(v); }
  setTransparentBg(v: boolean) { this.transparentBg.set(v); }
  setPadding(v: number) { this.padding.set(Math.round(this.clampNum(v, 0, 120))); }
  setAlign(a: 'left' | 'center' | 'right') { this.align.set(a); }
  setLineHeight(v: number) { this.lineHeight.set(this.clampNum(v, 1, 2.5)); }
  setFormat(f: 'png' | 'jpeg') { this.format.set(f); }

  private render() {
    const lines = this.text().split('\n');
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      this.imageUrl.set('');
      return;
    }
    const canvas = this.document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const style = `${this.italic() ? 'italic ' : ''}${this.bold() ? 'bold ' : ''}${this.fontSize()}px ${this.fontFamily()}`;
    ctx.font = style;
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    const pad = this.padding();
    const lineH = this.fontSize() * this.lineHeight();
    const w = Math.ceil(maxW + pad * 2);
    const h = Math.ceil(lineH * lines.length + pad * 2);
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const c2 = canvas.getContext('2d');
    if (!c2) return;
    if (!this.transparentBg()) {
      c2.fillStyle = this.bgColor();
      c2.fillRect(0, 0, canvas.width, canvas.height);
    }
    c2.font = style;
    c2.fillStyle = this.textColor();
    c2.textBaseline = 'top';
    const x = this.align() === 'left' ? pad : this.align() === 'right' ? canvas.width - pad : canvas.width / 2;
    c2.textAlign = this.align();
    lines.forEach((line, i) => {
      c2.fillText(line, x, pad + i * lineH);
    });
    this.imageUrl.set(canvas.toDataURL(this.format() === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    this.dims.set({ w: canvas.width, h: canvas.height });
  }

  download() {
    const url = this.imageUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `text-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
    a.click();
  }

  ngOnDestroy() {
    if (this.debounceId) clearTimeout(this.debounceId);
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
