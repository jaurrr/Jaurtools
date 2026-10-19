import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface PsdInfo {
  width: number;
  height: number;
  channels: number;
  colorMode: number;
  depth: number;
  compression: number;
}

@Component({
  selector: 'app-psd-to-jpg-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './psd-to-jpg-converter.component.html',
  styleUrl: './psd-to-jpg-converter.component.scss',
})
export class PsdToJpgConverterComponent implements OnDestroy {
  readonly slug = 'psd-to-jpg-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-resizer', 'merge-images', 'image-to-svg-converter', 'image-splitter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly info = signal<PsdInfo | null>(null);
  readonly errorMsg = signal('');
  readonly busy = signal(false);
  readonly quality = signal(92);

  readonly hasOutput = computed(() => this.info() !== null);

  readonly colorModeName = computed(() => {
    const i = this.info();
    if (!i) return '';
    return i.colorMode === 3 ? this.t('labels.modeRgb') : this.t('labels.modeGray');
  });

  readonly compressionName = computed(() => {
    const i = this.info();
    if (!i) return '';
    return i.compression === 0 ? this.t('labels.compRaw') : this.t('labels.compRle');
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('psdCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
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
    const name = file.name.toLowerCase();
    if (!name.endsWith('.psd') && !name.endsWith('.psb')) {
      this.errorMsg.set(this.t('labels.invalidType'));
      input.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.fileTooLarge'));
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    this.info.set(null);
    this.fileName.set(file.name);
    this.busy.set(true);
    file.arrayBuffer().then(
      (buf) => {
        try {
          const { info, pixels } = this.parsePsd(buf);
          this.drawToCanvas(info, pixels);
          this.info.set(info);
        } catch (e) {
          this.errorMsg.set(e instanceof Error ? e.message : this.t('labels.parseFailed'));
        } finally {
          this.busy.set(false);
        }
      },
      () => {
        this.errorMsg.set(this.t('labels.parseFailed'));
        this.busy.set(false);
      }
    );
    input.value = '';
  }

  setQuality(v: number): void { this.quality.set(this.clampNum(v, 10, 100)); }

  download(kind: 'png' | 'jpg'): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const a = this.document.createElement('a');
    if (kind === 'png') {
      a.href = canvas.toDataURL('image/png');
      a.download = this.fileName().replace(/\.(psd|psb)$/i, '') + '.png';
    } else {
      a.href = canvas.toDataURL('image/jpeg', this.quality() / 100);
      a.download = this.fileName().replace(/\.(psd|psb)$/i, '') + '.jpg';
    }
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parsePsd(buffer: ArrayBuffer): { info: PsdInfo; pixels: Uint8ClampedArray<ArrayBuffer> } {
    const view = new DataView(buffer);
    const u16 = (o: number): number => view.getUint16(o, false);
    const u32 = (o: number): number => view.getUint32(o, false);
    if (buffer.byteLength < 40) throw new Error(this.t('labels.parseFailed'));
    const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (sig !== '8BPS') throw new Error(this.t('labels.notPsd'));
    if (u16(4) !== 1) throw new Error(this.t('labels.parseFailed'));
    const channels = u16(12);
    const height = u32(14);
    const width = u32(18);
    const depth = u16(22);
    const colorMode = u16(24);
    if (depth !== 8) throw new Error(this.t('labels.unsupportedDepth'));
    if (colorMode !== 3 && colorMode !== 1) throw new Error(this.t('labels.unsupportedMode'));
    if (colorMode === 3 && (channels < 3 || channels > 4)) throw new Error(this.t('labels.unsupportedMode'));
    if (colorMode === 1 && (channels < 1 || channels > 2)) throw new Error(this.t('labels.unsupportedMode'));
    if (width < 1 || height < 1 || width > 12000 || height > 12000) throw new Error(this.t('labels.parseFailed'));
    const plane = width * height;
    if (plane > 50000000) throw new Error(this.t('labels.tooBig'));
    let o = 26;
    const skipSection = (): void => {
      const len = u32(o);
      o += 4 + len;
      if (o > buffer.byteLength) throw new Error(this.t('labels.noComposite'));
    };
    skipSection();
    skipSection();
    skipSection();
    if (o + 2 > buffer.byteLength) throw new Error(this.t('labels.noComposite'));
    const compression = u16(o);
    o += 2;
    if (compression !== 0 && compression !== 1) throw new Error(this.t('labels.unsupportedCompression'));
    const src = new Uint8Array(buffer);
    const planes: Uint8Array[] = [];
    for (let c = 0; c < channels; c++) {
      const dest = new Uint8Array(plane);
      if (compression === 0) {
        if (o + plane > src.length) throw new Error(this.t('labels.noComposite'));
        dest.set(src.subarray(o, o + plane));
        o += plane;
      } else {
        if (o + height * 2 > src.length) throw new Error(this.t('labels.noComposite'));
        o += height * 2;
        o = this.unpackRows(src, o, dest, height, width);
      }
      planes.push(dest);
    }
    const pixels = new Uint8ClampedArray(plane * 4);
    if (colorMode === 3) {
      const r = planes[0], g = planes[1], b = planes[2];
      const a = channels === 4 ? planes[3] : null;
      for (let i = 0; i < plane; i++) {
        pixels[i * 4] = r[i];
        pixels[i * 4 + 1] = g[i];
        pixels[i * 4 + 2] = b[i];
        pixels[i * 4 + 3] = a ? a[i] : 255;
      }
    } else {
      const g0 = planes[0];
      const a = channels === 2 ? planes[1] : null;
      for (let i = 0; i < plane; i++) {
        pixels[i * 4] = g0[i];
        pixels[i * 4 + 1] = g0[i];
        pixels[i * 4 + 2] = g0[i];
        pixels[i * 4 + 3] = a ? a[i] : 255;
      }
    }
    return { info: { width, height, channels, colorMode, depth, compression }, pixels };
  }

  private unpackRows(src: Uint8Array, start: number, dest: Uint8Array, height: number, width: number): number {
    let p = start;
    let d = 0;
    const total = height * width;
    while (d < total) {
      const n = src[p++];
      if (n < 128) {
        const len = n + 1;
        dest.set(src.subarray(p, p + len), d);
        p += len;
        d += len;
      } else if (n > 128) {
        const len = 257 - n;
        dest.fill(src[p++], d, d + len);
        d += len;
      }
    }
    return p;
  }

  private drawToCanvas(info: PsdInfo, pixels: Uint8ClampedArray<ArrayBuffer>): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) throw new Error(this.t('labels.parseFailed'));
    canvas.width = info.width;
    canvas.height = info.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(this.t('labels.parseFailed'));
    ctx.putImageData(new ImageData(pixels, info.width, info.height), 0, 0);
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
