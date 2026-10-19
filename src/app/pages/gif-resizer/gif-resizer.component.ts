import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';
import { DecodedGif, GifFrameInput, decodeGif, encodeGif } from './gif-codec';

const MAX_BYTES = 20 * 1024 * 1024;

@Component({
  selector: 'app-gif-resizer',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './gif-resizer.component.html',
  styleUrl: './gif-resizer.component.scss',
})
export class GifResizerComponent implements OnDestroy {
  readonly slug = 'gif-resizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['video-screenshot'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly loaded = signal(false);
  readonly srcWidth = signal(0);
  readonly srcHeight = signal(0);
  readonly frameCount = signal(0);
  readonly srcDurationMs = signal(0);
  readonly srcLoop = signal(0);
  readonly inputSize = signal(0);
  readonly origUrl = signal('');
  readonly outWidth = signal(320);
  readonly cropOn = signal(false);
  readonly cropX = signal(0);
  readonly cropY = signal(0);
  readonly cropW = signal(0);
  readonly cropH = signal(0);
  readonly speed = signal(1);
  readonly colors = signal<128 | 256>(256);
  readonly loopMode = signal<'infinite' | 'count'>('infinite');
  readonly loopCount = signal(3);
  readonly working = signal(false);
  readonly progress = signal(0);
  readonly error = signal('');
  readonly resultUrl = signal('');
  readonly resultSize = signal(0);
  readonly resultDims = signal('');

  readonly speedOptions = [0.25, 0.5, 1, 1.5, 2, 3, 4];

  private decoded: DecodedGif | null = null;
  private origObjectUrl = '';
  private resultObjectUrl = '';
  private stopFlag = false;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly outHeight = computed(() => {
    const sw = this.srcWidth();
    const sh = this.srcHeight();
    if (sw <= 0) return 0;
    return Math.max(2, Math.round((this.outWidth() / sw) * sh));
  });

  readonly srcDurationText = computed(() => `${(this.srcDurationMs() / 1000).toFixed(1)}s`);

  readonly inputSizeText = computed(() => {
    const b = this.inputSize();
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  });

  readonly resultSizeText = computed(() => {
    const b = this.resultSize();
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  });

  readonly sizeChangePct = computed(() => {
    const inp = this.inputSize();
    if (inp <= 0 || this.resultSize() <= 0) return 0;
    return Math.round((1 - this.resultSize() / inp) * 100);
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

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.clearResult();
    this.loaded.set(false);
    this.decoded = null;
    if (!file) return;
    const okType = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    if (!okType) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const gif = decodeGif(bytes);
      this.decoded = gif;
      this.fileName.set(file.name);
      this.inputSize.set(file.size);
      this.srcWidth.set(gif.width);
      this.srcHeight.set(gif.height);
      this.frameCount.set(gif.frames.length);
      this.srcLoop.set(gif.loop);
      this.srcDurationMs.set(gif.frames.reduce((n, f) => n + f.delayMs, 0));
      this.outWidth.set(Math.min(gif.width, 480));
      this.cropX.set(0);
      this.cropY.set(0);
      this.cropW.set(gif.width);
      this.cropH.set(gif.height);
      this.cropOn.set(false);
      if (this.origObjectUrl) URL.revokeObjectURL(this.origObjectUrl);
      this.origObjectUrl = URL.createObjectURL(file);
      this.origUrl.set(this.origObjectUrl);
      this.loaded.set(true);
    } catch {
      this.error.set(this.t('labels.errDecode'));
      input.value = '';
    }
  }

  setOutWidth(v: number) {
    this.outWidth.set(this.clampNum(v, 16, 1200));
  }
  setCropX(v: number) {
    this.cropX.set(this.clampNum(v, 0, Math.max(0, this.srcWidth() - 2)));
  }
  setCropY(v: number) {
    this.cropY.set(this.clampNum(v, 0, Math.max(0, this.srcHeight() - 2)));
  }
  setCropW(v: number) {
    this.cropW.set(this.clampNum(v, 2, this.srcWidth() - this.cropX()));
  }
  setCropH(v: number) {
    this.cropH.set(this.clampNum(v, 2, this.srcHeight() - this.cropY()));
  }
  toggleCrop() {
    this.cropOn.set(!this.cropOn());
  }
  setSpeed(v: number) {
    this.speed.set(v);
  }
  setColors(c: 128 | 256) {
    this.colors.set(c);
  }
  setLoopMode(m: 'infinite' | 'count') {
    this.loopMode.set(m);
  }
  setLoopCount(v: number) {
    this.loopCount.set(this.clampNum(v, 1, 100));
  }

  async apply() {
    const gif = this.decoded;
    if (!gif) {
      this.error.set(this.t('labels.errNoGif'));
      return;
    }
    this.error.set('');
    this.clearResult();
    this.working.set(true);
    this.progress.set(2);
    this.stopFlag = false;
    try {
      const crop = this.cropOn()
        ? {
            x: Math.min(this.cropX(), gif.width - 2),
            y: Math.min(this.cropY(), gif.height - 2),
            w: Math.min(this.cropW(), gif.width - this.cropX()),
            h: Math.min(this.cropH(), gif.height - this.cropY()),
          }
        : { x: 0, y: 0, w: gif.width, h: gif.height };
      if (crop.w < 2 || crop.h < 2) throw new Error('bad-crop');
      const outW = Math.max(2, this.outWidth());
      const outH = Math.max(2, Math.round((outW / crop.w) * crop.h));
      if (outW * outH > 1920 * 1080) throw new Error('too-big');

      const srcC = this.document.createElement('canvas');
      srcC.width = gif.width;
      srcC.height = gif.height;
      const sctx = srcC.getContext('2d', { willReadFrequently: true });
      const dstC = this.document.createElement('canvas');
      dstC.width = outW;
      dstC.height = outH;
      const dctx = dstC.getContext('2d', { willReadFrequently: true });
      if (!sctx || !dctx) throw new Error('no-ctx');

      const frames: GifFrameInput[] = [];
      const speed = this.speed();
      for (let i = 0; i < gif.frames.length; i++) {
        if (this.stopFlag) return;
        const f = gif.frames[i];
        sctx.putImageData(new ImageData(new Uint8ClampedArray(f.data.buffer as ArrayBuffer, f.data.byteOffset, f.data.length), gif.width, gif.height), 0, 0);
        dctx.clearRect(0, 0, outW, outH);
        dctx.drawImage(srcC, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
        const img = dctx.getImageData(0, 0, outW, outH);
        frames.push({ data: img.data, delayMs: Math.max(20, f.delayMs / speed) });
        if (i % 5 === 0) {
          this.progress.set(2 + Math.round((i / gif.frames.length) * 40));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      const loop = this.loopMode() === 'infinite' ? 0 : Math.round(this.loopCount());
      const bytes = await encodeGif(outW, outH, frames, {
        loop,
        maxColors: this.colors(),
        onProgress: (p) => {
          if (!this.stopFlag) this.progress.set(42 + Math.round(p * 56));
        },
      });
      if (this.stopFlag) return;
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
      if (this.resultObjectUrl) URL.revokeObjectURL(this.resultObjectUrl);
      this.resultObjectUrl = URL.createObjectURL(blob);
      this.resultUrl.set(this.resultObjectUrl);
      this.resultSize.set(blob.size);
      this.resultDims.set(`${outW} × ${outH}`);
      this.progress.set(100);
    } catch {
      this.error.set(this.t('labels.errApply'));
    } finally {
      this.working.set(false);
    }
  }

  cancel() {
    this.stopFlag = true;
    this.working.set(false);
    this.progress.set(0);
  }

  again() {
    this.clearResult();
    this.error.set('');
  }

  private clearResult() {
    if (this.resultObjectUrl) URL.revokeObjectURL(this.resultObjectUrl);
    this.resultObjectUrl = '';
    this.resultUrl.set('');
    this.resultSize.set(0);
    this.resultDims.set('');
    this.progress.set(0);
  }

  ngOnDestroy() {
    this.stopFlag = true;
    this.clearResult();
    if (this.origObjectUrl) URL.revokeObjectURL(this.origObjectUrl);
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
    return Math.min(max, Math.max(min, Math.round(v)));
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
