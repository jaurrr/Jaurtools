import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-duotone-effect',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './duotone-effect.component.html',
  styleUrl: './duotone-effect.component.scss',
})
export class DuotoneEffectComponent implements OnDestroy {
  readonly slug = 'duotone-effect';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['glow-effect', 'emboss-effect', 'edge-detection', 'photo-equalizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly shadow = signal('#191414');
  readonly highlight = signal('#1db954');
  readonly strength = signal(100);

  private readonly stage = viewChild<ElementRef<HTMLCanvasElement>>('stage');

  private img: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.loaded();
      this.shadow();
      this.highlight();
      this.strength();
      this.render();
    });
  }

  readonly presets = computed(() => [
    { key: 'spotify', shadow: '#191414', highlight: '#1db954' },
    { key: 'sunset', shadow: '#2b1055', highlight: '#ff9a3c' },
    { key: 'ocean', shadow: '#0b2545', highlight: '#4cc9f0' },
    { key: 'noir', shadow: '#0f0f0f', highlight: '#e8e8e8' },
    { key: 'rose', shadow: '#3b0a2a', highlight: '#ff5d8f' },
    { key: 'mint', shadow: '#073b3a', highlight: '#7ef0c9' },
  ]);

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

  presetName(key: string): string {
    return this.t(`labels.presets.${key}`);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMsg.set('');
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.typeError'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.errorMsg.set(this.t('labels.sizeError'));
      return;
    }
    this.clearImage();
    this.objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.imgW.set(img.naturalWidth);
      this.imgH.set(img.naturalHeight);
      this.fileName.set(file.name);
      this.loaded.set(true);
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
      this.clearImage();
    };
    img.src = this.objectUrl;
  }

  applyPreset(shadow: string, highlight: string): void {
    this.shadow.set(shadow);
    this.highlight.set(highlight);
  }

  setShadow(v: string): void { this.shadow.set(v); }
  setHighlight(v: string): void { this.highlight.set(v); }
  setStrength(v: number): void { this.strength.set(this.clampNum(v, 0, 100)); }

  download(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.loaded()) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `duotone-${canvas.width}x${canvas.height}.png`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  clearImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.img = null;
    this.loaded.set(false);
    this.fileName.set('');
    this.errorMsg.set('');
  }

  ngOnDestroy() {
    this.clearImage();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.img || !this.loaded()) return;
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(this.imgW(), this.imgH()));
    const w = Math.max(1, Math.round(this.imgW() * scale));
    const h = Math.max(1, Math.round(this.imgH() * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const s = this.hexToRgb(this.shadow());
    const hl = this.hexToRgb(this.highlight());
    const mix = this.strength() / 100;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const tt = gray / 255;
      const dr = s.r + (hl.r - s.r) * tt;
      const dg = s.g + (hl.g - s.g) * tt;
      const db = s.b + (hl.b - s.b) * tt;
      data[i] = gray + (dr - gray) * mix;
      data[i + 1] = gray + (dg - gray) * mix;
      data[i + 2] = gray + (db - gray) * mix;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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
