import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type CompressMode = 'quality' | 'target';

@Component({
  selector: 'app-image-compressor',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, PasteDropDirective],
  templateUrl: './image-compressor.component.html',
  styleUrl: './image-compressor.component.scss',
})
export class ImageCompressorComponent implements OnDestroy {
  readonly slug = 'image-compressor';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['image-resizer', 'image-converter', 'image-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly baBox = viewChild<ElementRef<HTMLElement>>('baBox');

  readonly fileName = signal('');
  readonly error = signal('');
  readonly mode = signal<CompressMode>('quality');
  readonly quality = signal(80);
  readonly targetKB = signal(200);
  readonly format = signal<'jpeg' | 'webp' | 'png'>('jpeg');
  readonly maxWidth = signal(1600);
  readonly originalSize = signal(0);
  readonly compressedSize = signal(0);
  readonly compressedUrl = signal('');
  readonly compressedName = signal('');
  readonly processing = signal(false);
  readonly previewUrl = signal('');
  readonly originalUrl = signal('');
  readonly origW = signal(0);
  readonly origH = signal(0);
  readonly outW = signal(0);
  readonly outH = signal(0);
  readonly divPos = signal(50);

  private objectUrl: string | null = null;
  private srcImg: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private divDrag = false;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);
  readonly savingsPct = computed(() => {
    const o = this.originalSize();
    const c = this.compressedSize();
    if (o <= 0 || c <= 0) return 0;
    return Math.round(((o - c) / o) * 100);
  });
  readonly mimeType = computed(() => `image/${this.format()}`);
  readonly formats = computed(() => [
    { value: 'jpeg', label: this.t('labels.formatJpeg') },
    { value: 'webp', label: this.t('labels.formatWebp') },
    { value: 'png', label: this.t('labels.formatPng') },
  ]);
  readonly meterOutPct = computed(() => {
    const o = this.originalSize();
    const c = this.compressedSize();
    if (o <= 0 || c <= 0) return 0;
    return Math.min(100, Math.max(2, Math.round((c / o) * 100)));
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

  setMode(m: CompressMode) {
    this.mode.set(m);
    this.scheduleLive();
  }
  setQuality(v: number) {
    this.quality.set(this.clampNum(v, 10, 100));
    this.scheduleLive();
  }
  setTargetKB(v: number) {
    this.targetKB.set(this.clampNum(v, 10, 51200));
    this.scheduleLive();
  }
  setFormat(f: string) {
    if (f === 'jpeg' || f === 'webp' || f === 'png') {
      this.format.set(f);
      this.scheduleLive();
    }
  }
  setMaxWidth(v: number) {
    this.maxWidth.set(this.clampNum(v, 100, 8000));
    this.scheduleLive();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  useSample() {
    const canvas = this.document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sky = ctx.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#1e3a8a');
    sky.addColorStop(0.55, '#7c3aed');
    sky.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1280, 800);
    for (let i = 0; i < 90; i++) {
      const x = (i * 197) % 1280;
      const y = (i * 331) % 420;
      const r = 2 + ((i * 13) % 26);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + ((i * 7) % 40) / 100})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, 800);
    ctx.lineTo(320, 420);
    ctx.lineTo(640, 800);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(480, 800);
    ctx.lineTo(880, 360);
    ctx.lineTo(1280, 800);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(1020, 180, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    for (let d = 0; d < 1280; d += 46) {
      ctx.beginPath();
      ctx.moveTo(d, 800);
      ctx.lineTo(d + 200, 560);
      ctx.stroke();
    }
    canvas.toBlob((blob) => {
      if (blob) this.loadFile(new File([blob], this.t('labels.sampleName'), { type: 'image/png' }));
    }, 'image/png');
  }

  reset() {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.fileName.set('');
    this.error.set('');
    this.originalSize.set(0);
    this.compressedSize.set(0);
    this.compressedName.set('');
    this.previewUrl.set('');
    this.originalUrl.set('');
    this.origW.set(0);
    this.origH.set(0);
    this.outW.set(0);
    this.outH.set(0);
    this.divPos.set(50);
    this.srcImg = null;
    if (this.compressedUrl()) {
      URL.revokeObjectURL(this.compressedUrl());
      this.compressedUrl.set('');
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  onDivDown(event: PointerEvent) {
    this.divDrag = true;
    this.moveDiv(event);
    event.preventDefault();
  }
  onDivMove(event: PointerEvent) {
    if (this.divDrag) this.moveDiv(event);
  }
  onDivUp() {
    this.divDrag = false;
  }
  onDivKey(event: KeyboardEvent) {
    const step = event.key === 'ArrowLeft' ? -4 : event.key === 'ArrowRight' ? 4 : 0;
    if (step !== 0) {
      event.preventDefault();
      this.divPos.set(Math.min(96, Math.max(4, this.divPos() + step)));
    }
  }
  private moveDiv(event: PointerEvent) {
    const box = this.baBox()?.nativeElement;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    this.divPos.set(Math.min(96, Math.max(4, Math.round(pct))));
  }

  formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val >= 100 ? Math.round(val) : Math.round(val * 10) / 10} ${units[i]}`;
  }

  private loadFile(file: File) {
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    this.originalSize.set(file.size);
    this.originalUrl.set(this.objectUrl);
    this.origW.set(0);
    this.origH.set(0);
    this.outW.set(0);
    this.outH.set(0);
    this.compressedSize.set(0);
    if (this.compressedUrl()) {
      URL.revokeObjectURL(this.compressedUrl());
      this.compressedUrl.set('');
    }
    this.previewUrl.set('');
    this.srcImg = null;
    const img = new Image();
    img.onload = () => {
      this.origW.set(img.naturalWidth);
      this.origH.set(img.naturalHeight);
      this.srcImg = img;
      this.scheduleLive();
    };
    img.onerror = () => this.error.set(this.t('labels.loadFailed'));
    img.src = this.objectUrl;
  }

  private scheduleLive() {
    if (!this.srcImg) return;
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      void this.renderLive();
    }, 280);
  }

  private async renderLive(): Promise<void> {
    const img = this.srcImg;
    if (!img) return;
    this.processing.set(true);
    this.error.set('');
    try {
      const maxW = this.maxWidth();
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const mime = this.mimeType();
      let blob: Blob | null;
      let fw = w;
      let fh = h;
      if (this.mode() === 'target') {
        const fit = await this.encodeToTarget(img, w, h, mime, this.targetKB() * 1024);
        blob = fit.blob;
        fw = fit.w;
        fh = fit.h;
      } else {
        const canvas = this.draw(img, w, h, mime);
        const q = this.format() === 'png' ? undefined : this.quality() / 100;
        blob = canvas ? await this.blobOf(canvas, mime, q) : null;
      }
      if (!blob) {
        this.error.set(this.t('labels.compressFailed'));
        return;
      }
      if (this.compressedUrl()) URL.revokeObjectURL(this.compressedUrl());
      this.compressedUrl.set(URL.createObjectURL(blob));
      this.compressedSize.set(blob.size);
      this.outW.set(fw);
      this.outH.set(fh);
      const dot = this.fileName().lastIndexOf('.');
      const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
      const ext = this.format() === 'jpeg' ? 'jpg' : this.format();
      this.compressedName.set(`${base}-compressed.${ext}`);
      this.previewUrl.set(this.compressedUrl());
    } finally {
      this.processing.set(false);
    }
  }

  private draw(img: HTMLImageElement, w: number, h: number, mime: string): HTMLCanvasElement | null {
    const canvas = this.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  private blobOf(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (quality === undefined) canvas.toBlob((b) => resolve(b), mime);
      else canvas.toBlob((b) => resolve(b), mime, quality);
    });
  }

  private async encodeToTarget(
    img: HTMLImageElement,
    startW: number,
    startH: number,
    mime: string,
    targetBytes: number,
  ): Promise<{ blob: Blob; w: number; h: number }> {
    let w = startW;
    let h = startH;
    for (let round = 0; round < 10; round++) {
      const canvas = this.draw(img, w, h, mime);
      if (!canvas) break;
      let lo = 5;
      let hi = 100;
      let best: Blob | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const blob = await this.blobOf(canvas, mime, mid / 100);
        if (blob && blob.size <= targetBytes) {
          best = blob;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (best) return { blob: best, w, h };
      const nw = Math.max(64, Math.round(w * 0.85));
      const nh = Math.max(64, Math.round(h * 0.85));
      if (nw === w && nh === h) break;
      w = nw;
      h = nh;
    }
    const canvas = this.draw(img, w, h, mime);
    const fallback = canvas ? await this.blobOf(canvas, mime, 0.05) : null;
    if (!fallback) throw new Error('encode-failed');
    return { blob: fallback, w, h };
  }

  ngOnDestroy() {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    if (this.compressedUrl()) URL.revokeObjectURL(this.compressedUrl());
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
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
