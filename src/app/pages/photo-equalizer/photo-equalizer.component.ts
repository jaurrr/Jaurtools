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
  selector: 'app-photo-equalizer',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-equalizer.component.html',
  styleUrl: './photo-equalizer.component.scss',
})
export class PhotoEqualizerComponent implements OnDestroy {
  readonly slug = 'photo-equalizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['duotone-effect', 'edge-detection', 'emboss-effect', 'glow-effect'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly scope = signal<'full' | 'area'>('full');
  readonly channel = signal<'luminance' | 'rgb'>('luminance');
  readonly rect = signal({ x: 0, y: 0, w: 0, h: 0 });
  readonly showOriginal = signal(false);

  private readonly stage = viewChild<ElementRef<HTMLCanvasElement>>('stage');

  private img: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.loaded();
      this.scope();
      this.channel();
      this.rect();
      this.showOriginal();
      this.render();
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
      this.rect.set({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
      this.loaded.set(true);
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
      this.clearImage();
    };
    img.src = this.objectUrl;
  }

  setScope(s: 'full' | 'area'): void { this.scope.set(s); }
  setChannel(c: 'luminance' | 'rgb'): void { this.channel.set(c); }
  toggleOriginal(): void { this.showOriginal.update((v) => !v); }

  onPointerDown(event: PointerEvent): void {
    if (!this.img || this.scope() !== 'area') return;
    this.dragging = true;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = this.toImageCoords(event);
    this.rect.set({ x: this.dragStart.x, y: this.dragStart.y, w: 0, h: 0 });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.img) return;
    const p = this.toImageCoords(event);
    const x = Math.max(0, Math.min(Math.min(this.dragStart.x, p.x), this.imgW() - 1));
    const y = Math.max(0, Math.min(Math.min(this.dragStart.y, p.y), this.imgH() - 1));
    const w = Math.max(1, Math.min(Math.abs(p.x - this.dragStart.x), this.imgW() - x));
    const h = Math.max(1, Math.min(Math.abs(p.y - this.dragStart.y), this.imgH() - y));
    this.rect.set({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  download(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.loaded()) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `equalized-${canvas.width}x${canvas.height}.png`;
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

  private toImageCoords(event: PointerEvent): { x: number; y: number } {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.imgW(), (event.clientX - rect.left) * (this.imgW() / rect.width))),
      y: Math.max(0, Math.min(this.imgH(), (event.clientY - rect.top) * (this.imgH() / rect.height))),
    };
  }

  private render(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.img || !this.loaded()) return;
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(this.imgW(), this.imgH()));
    const w = Math.max(1, Math.round(this.imgW() * scale));
    const h = Math.max(1, Math.round(this.imgH() * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.img, 0, 0, w, h);
    if (this.showOriginal()) return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const r = this.scope() === 'area' ? this.rect() : { x: 0, y: 0, w: this.imgW(), h: this.imgH() };
    const rx = Math.max(0, Math.min(w - 1, Math.round(r.x * scale)));
    const ry = Math.max(0, Math.min(h - 1, Math.round(r.y * scale)));
    const rw = Math.max(1, Math.min(w - rx, Math.round(r.w * scale)));
    const rh = Math.max(1, Math.min(h - ry, Math.round(r.h * scale)));
    if (this.channel() === 'luminance') {
      const hist = new Array<number>(256).fill(0);
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const i = (y * w + x) * 4;
          hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
        }
      }
      const map = this.equalizeMap(hist, rw * rh);
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const i = (y * w + x) * 4;
          const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          const ng = map[g];
          const f = g === 0 ? 1 : ng / g;
          data[i] = this.clamp255(data[i] * f);
          data[i + 1] = this.clamp255(data[i + 1] * f);
          data[i + 2] = this.clamp255(data[i + 2] * f);
        }
      }
    } else {
      const maps: number[][] = [];
      for (let c = 0; c < 3; c++) {
        const hist = new Array<number>(256).fill(0);
        for (let y = ry; y < ry + rh; y++) {
          for (let x = rx; x < rx + rw; x++) {
            hist[data[(y * w + x) * 4 + c]]++;
          }
        }
        maps.push(this.equalizeMap(hist, rw * rh));
      }
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const i = (y * w + x) * 4;
          data[i] = maps[0][data[i]];
          data[i + 1] = maps[1][data[i + 1]];
          data[i + 2] = maps[2][data[i + 2]];
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    if (this.scope() === 'area' && rw > 0 && rh > 0) {
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  private equalizeMap(hist: number[], total: number): number[] {
    const cdf = new Array<number>(256);
    let acc = 0;
    let cdfMin = -1;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      cdf[i] = acc;
      if (cdfMin < 0 && acc > 0) cdfMin = acc;
    }
    const denom = total - cdfMin;
    const map = new Array<number>(256);
    for (let i = 0; i < 256; i++) {
      map[i] = denom > 0 ? Math.round(((cdf[i] - cdfMin) / denom) * 255) : i;
    }
    return map;
  }

  private clamp255(v: number): number {
    return Math.max(0, Math.min(255, Math.round(v)));
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
