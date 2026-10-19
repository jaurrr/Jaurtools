import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type Method = 'median3' | 'median5' | 'gaussian';

@Component({
  selector: 'app-image-denoiser',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-denoiser.component.html',
  styleUrl: './image-denoiser.component.scss',
})
export class ImageDenoiserComponent implements OnDestroy {
  readonly slug = 'image-denoiser';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sharpen-image', 'pixelate-image', 'image-resizer', 'sepia-effect'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly method = signal<Method>('median3');
  readonly strength = signal(1.5);
  readonly passes = signal(1);
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly errorMsg = signal('');
  readonly busy = signal(false);
  readonly scaledNote = signal(false);

  readonly methods: Method[] = ['median3', 'median5', 'gaussian'];
  readonly hasOutput = computed(() => this.image() !== null);

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('noiseCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private objectUrls: string[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.render();
    });
  }

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
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.invalidType'));
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.fileTooLarge'));
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    const url = URL.createObjectURL(file);
    this.objectUrls.push(url);
    const img = new Image();
    img.onload = () => this.image.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setMethod(m: Method): void { this.method.set(m); }
  setStrength(v: number): void { this.strength.set(this.clampNum(v, 0.5, 4)); }
  setPasses(v: number): void { this.passes.set(this.clampNum(v, 1, 3)); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.92);
    a.download = `denoised-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    const im = this.image();
    if (!canvas || !im) return;
    this.busy.set(true);
    try {
      const maxSide = 2048;
      const k = Math.min(1, maxSide / Math.max(im.width, im.height));
      const w = Math.max(1, Math.round(im.width * k));
      const h = Math.max(1, Math.round(im.height * k));
      this.scaledNote.set(k < 1);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(im.img, 0, 0, w, h);
      const method = this.method();
      if (method === 'gaussian') {
        const blurred = this.document.createElement('canvas');
        blurred.width = w;
        blurred.height = h;
        const bctx = blurred.getContext('2d');
        if (!bctx) return;
        bctx.filter = `blur(${this.strength()}px)`;
        bctx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(blurred, 0, 0);
      } else {
        const radius = method === 'median3' ? 1 : 2;
        for (let p = 0; p < this.passes(); p++) {
          const data = ctx.getImageData(0, 0, w, h);
          this.medianPass(data, w, h, radius);
          ctx.putImageData(data, 0, 0);
        }
      }
    } finally {
      this.busy.set(false);
    }
  }

  private medianPass(data: ImageData, w: number, h: number, radius: number): void {
    const src = new Uint8ClampedArray(data.data);
    const px = data.data;
    const size = (radius * 2 + 1) * (radius * 2 + 1);
    const win = new Array<number>(size);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let n = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -radius; dx <= radius; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              win[n++] = src[(yy * w + xx) * 4 + c];
            }
          }
          win.sort((a, b) => a - b);
          px[(y * w + x) * 4 + c] = win[size >> 1];
        }
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

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
