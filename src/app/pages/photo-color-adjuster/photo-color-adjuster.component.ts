import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

@Component({
  selector: 'app-photo-color-adjuster',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-color-adjuster.component.html',
  styleUrl: './photo-color-adjuster.component.scss',
})
export class PhotoColorAdjusterComponent implements OnDestroy {
  readonly slug = 'photo-color-adjuster';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['color-saturation-adjuster', 'tints-shades-generator', 'color-desaturator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly hue = signal(0);
  readonly saturation = signal(100);
  readonly vibrance = signal(100);
  readonly exposure = signal(0);
  readonly gamma = signal(1);
  readonly channelR = signal(100);
  readonly channelG = signal(100);
  readonly channelB = signal(100);
  readonly showOriginal = signal(false);
  readonly imageLoaded = signal(false);
  readonly errorMsg = signal('');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('resultCanvas');
  private original: ImageData | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
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

  setHue(v: number) { this.hue.set(this.clampNum(v, -180, 180)); this.apply(); }
  setSaturation(v: number) { this.saturation.set(this.clampNum(v, 0, 200)); this.apply(); }
  setVibrance(v: number) { this.vibrance.set(this.clampNum(v, 0, 200)); this.apply(); }
  setExposure(v: number) { this.exposure.set(this.clampNum(v, -2, 2)); this.apply(); }
  setGamma(v: number) { this.gamma.set(this.clampNum(v, 0.1, 4)); this.apply(); }
  setChannelR(v: number) { this.channelR.set(this.clampNum(v, 0, 200)); this.apply(); }
  setChannelG(v: number) { this.channelG.set(this.clampNum(v, 0, 200)); this.apply(); }
  setChannelB(v: number) { this.channelB.set(this.clampNum(v, 0, 200)); this.apply(); }
  toggleOriginal(v: boolean) { this.showOriginal.set(v); this.apply(); }

  resetAll() {
    this.hue.set(0); this.saturation.set(100); this.vibrance.set(100);
    this.exposure.set(0); this.gamma.set(1);
    this.channelR.set(100); this.channelG.set(100); this.channelB.set(100);
    this.showOriginal.set(false);
    this.apply();
  }

  onFile(event: Event) {
    this.errorMsg.set('');
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.errorType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.errorSize'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = this.canvasRef()?.nativeElement;
        if (!canvas) return;
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.original = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.imageLoaded.set(true);
        this.resetAll();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  downloadPng() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.imageLoaded()) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'jaurtools-adjusted.png';
    a.click();
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private apply() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.original || !this.imageLoaded()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = this.original.data;
    const out = ctx.createImageData(canvas.width, canvas.height);
    const dst = out.data;
    const expF = Math.pow(2, this.exposure());
    const gR = this.channelR() / 100, gG = this.channelG() / 100, gB = this.channelB() / 100;
    const gm = this.gamma();
    const hueShift = this.hue();
    const satF = this.saturation() / 100;
    const vib = (this.vibrance() - 100) / 100;
    const showOrig = this.showOriginal();
    for (let i = 0; i < src.length; i += 4) {
      let r = src[i], g = src[i + 1], b = src[i + 2];
      if (!showOrig) {
        r = clamp255(r * gR * expF);
        g = clamp255(g * gG * expF);
        b = clamp255(b * gB * expF);
        r = 255 * Math.pow(r / 255, gm);
        g = 255 * Math.pow(g / 255, gm);
        b = 255 * Math.pow(b / 255, gm);
        const hsl = rgbToHsl(r, g, b);
        let h = (hsl[0] + hueShift) % 360;
        if (h < 0) h += 360;
        let s = Math.min(1, Math.max(0, hsl[1] * satF));
        s = Math.min(1, Math.max(0, s * (1 + vib * (1 - s))));
        const rgb = hslToRgb(h, s, hsl[2]);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      }
      dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = src[i + 3];
    }
    ctx.putImageData(out, 0, 0);
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
