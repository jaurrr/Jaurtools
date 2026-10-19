import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type AspectKey = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-cropper.component.html',
  styleUrl: './image-cropper.component.scss',
})
export class ImageCropperComponent implements OnDestroy {
  readonly slug = 'image-cropper';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rotate-flip-photo', 'image-color-extractor', 'favicon-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly aspect = signal<AspectKey>('free');
  readonly sel = signal({ x: 0, y: 0, w: 0, h: 0 });
  readonly croppedUrl = signal<string | null>(null);
  readonly cropW = signal(0);
  readonly cropH = signal(0);

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
      this.sel();
      this.aspect();
      this.render();
    });
  }

  readonly aspects: AspectKey[] = ['free', '1:1', '4:3', '3:4', '16:9', '9:16'];

  readonly aspectLabel = computed(() => {
    const a = this.aspect();
    return a === 'free' ? this.t('labels.free') : a;
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
      this.sel.set({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
      this.croppedUrl.set(null);
      this.loaded.set(true);
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
      this.clearImage();
    };
    img.src = this.objectUrl;
  }

  setAspect(a: AspectKey): void {
    this.aspect.set(a);
    if (!this.img || a === 'free') return;
    const [rw, rh] = a.split(':').map(Number);
    const ratio = rw / rh;
    const iw = this.imgW();
    const ih = this.imgH();
    let w = iw * 0.8;
    let h = w / ratio;
    if (h > ih * 0.9) {
      h = ih * 0.9;
      w = h * ratio;
    }
    this.sel.set({
      x: Math.round((iw - w) / 2),
      y: Math.round((ih - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
    });
    this.croppedUrl.set(null);
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.img) return;
    this.dragging = true;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = this.toImageCoords(event);
    this.sel.set({ x: this.dragStart.x, y: this.dragStart.y, w: 0, h: 0 });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.img) return;
    const p = this.toImageCoords(event);
    let x = Math.min(this.dragStart.x, p.x);
    let y = Math.min(this.dragStart.y, p.y);
    let w = Math.abs(p.x - this.dragStart.x);
    let h = Math.abs(p.y - this.dragStart.y);
    const a = this.aspect();
    if (a !== 'free') {
      const [rw, rh] = a.split(':').map(Number);
      const ratio = rw / rh;
      if (w / Math.max(h, 1) > ratio) w = h * ratio;
      else h = w / ratio;
      x = this.dragStart.x + (p.x < this.dragStart.x ? -w : 0);
      y = this.dragStart.y + (p.y < this.dragStart.y ? -h : 0);
    }
    x = Math.max(0, Math.min(x, this.imgW() - 1));
    y = Math.max(0, Math.min(y, this.imgH() - 1));
    w = Math.max(1, Math.min(w, this.imgW() - x));
    h = Math.max(1, Math.min(h, this.imgH() - y));
    this.sel.set({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  applyCrop(): void {
    const s = this.sel();
    if (!this.img || s.w < 1 || s.h < 1) return;
    const out = this.document.createElement('canvas');
    out.width = s.w;
    out.height = s.h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    this.cropW.set(s.w);
    this.cropH.set(s.h);
    this.croppedUrl.set(out.toDataURL('image/png'));
  }

  download(): void {
    const url = this.croppedUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `cropped-${this.cropW()}x${this.cropH()}.png`;
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
    this.croppedUrl.set(null);
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
    const maxW = 860;
    const scale = Math.min(1, maxW / this.imgW());
    const dw = Math.max(1, Math.round(this.imgW() * scale));
    const dh = Math.max(1, Math.round(this.imgH() * scale));
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.img, 0, 0, dw, dh);
    const s = this.sel();
    if (s.w > 0 && s.h > 0) {
      const sx = s.x * scale;
      const sy = s.y * scale;
      const sw = s.w * scale;
      const sh = s.h * scale;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(0, 0, dw, dh);
      ctx.clearRect(sx, sy, sw, sh);
      ctx.drawImage(this.img, s.x, s.y, s.w, s.h, sx, sy, sw, sh);
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = '#4f46e5';
      const hs = 8;
      for (const [hx, hy] of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]]) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
    }
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
