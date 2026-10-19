import { Component, computed, effect, ElementRef, inject, OnDestroy, AfterViewInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
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
  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)];
}

interface Rgb { r: number; g: number; b: number }

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent implements AfterViewInit, OnDestroy {
  readonly slug = 'color-picker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['color-code-converter', 'hex-to-rgba-converter', 'color-contrast-checker', 'analogous-color-scheme'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly color = signal<Rgb>({ r: 79, g: 70, b: 229 });
  readonly copied = signal('');
  readonly imageLoaded = signal(false);
  readonly errorMsg = signal('');

  private readonly spectrumRef = viewChild<ElementRef<HTMLCanvasElement>>('spectrumCanvas');
  private readonly imageRef = viewChild<ElementRef<HTMLCanvasElement>>('imageCanvas');
  private spectrumDrawn = false;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit() {
    this.drawSpectrum();
  }

  readonly hsl = computed(() => {
    const c = this.color();
    return rgbToHsl(c.r, c.g, c.b);
  });

  readonly outputs = computed(() => {
    const c = this.color();
    const r = clamp255(c.r), g = clamp255(c.g), b = clamp255(c.b);
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    const hsl = rgbToHsl(r, g, b);
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const hsvS = max === 0 ? 0 : (max - min) / max;
    const k = 1 - max;
    const cmy = (v: number) => (k >= 1 ? 0 : Math.round(((max - v / 255) / max) * 100));
    return {
      hex,
      rgb: `rgb(${r}, ${g}, ${b})`,
      hsl: `hsl(${Math.round(hsl[0])}, ${Math.round(hsl[1] * 100)}%, ${Math.round(hsl[2] * 100)}%)`,
      hsv: `hsv(${Math.round(hsl[0])}, ${Math.round(hsvS * 100)}%, ${Math.round(max * 100)}%)`,
      cmyk: `cmyk(${cmy(r)}%, ${cmy(g)}%, ${cmy(b)}%, ${Math.round(k * 100)}%)`,
    };
  });

  readonly lightness = computed(() => Math.round(this.hsl()[2] * 100));

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

  setChannel(which: 'r' | 'g' | 'b', v: number) {
    const c = this.color();
    const nv = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
    this.color.set({ ...c, [which]: nv });
  }

  setLightness(v: number) {
    const l = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    const h = this.hsl()[0], s = this.hsl()[1];
    const rgb = hslToRgb(h, s, l);
    this.color.set({ r: rgb[0], g: rgb[1], b: rgb[2] });
  }

  onSpectrumPick(event: MouseEvent) {
    const canvas = this.spectrumRef()?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const h = x * 360;
    const s = 1 - y;
    const l = this.hsl()[2];
    const rgb = hslToRgb(h, s, l);
    this.color.set({ r: rgb[0], g: rgb[1], b: rgb[2] });
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
        const canvas = this.imageRef()?.nativeElement;
        if (!canvas) return;
        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.imageLoaded.set(true);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  onImagePick(event: MouseEvent) {
    const canvas = this.imageRef()?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const d = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, x)), Math.max(0, Math.min(canvas.height - 1, y)), 1, 1).data;
    this.color.set({ r: d[0], g: d[1], b: d[2] });
  }

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

  private drawSpectrum() {
    const canvas = this.spectrumRef()?.nativeElement;
    if (!canvas || this.spectrumDrawn) return;
    this.spectrumDrawn = true;
    const w = 300, h = 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rgb = hslToRgb((x / w) * 360, 1 - y / h, 0.5);
        const i = (y * w + x) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
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
