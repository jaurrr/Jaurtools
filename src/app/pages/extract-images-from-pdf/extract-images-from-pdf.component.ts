import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFNumber, PDFRef } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface FoundImg {
  id: number;
  page: number;
  width: number;
  height: number;
  format: 'JPEG' | 'PNG';
  bytes: Uint8Array;
}

@Component({
  selector: 'app-extract-images-from-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './extract-images-from-pdf.component.html',
  styleUrl: './extract-images-from-pdf.component.scss',
})
export class ExtractImagesFromPdfComponent implements OnDestroy {
  readonly slug = 'extract-images-from-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-text', 'jpg-to-pdf', 'compress-pdf', 'merge-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly images = signal<FoundImg[]>([]);
  readonly skipped = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly scanned = signal(false);

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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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
    this.scanned.set(false);
    this.images.set([]);
    this.skipped.set(0);
    if (!file) return;
    if (!this.validPdf(file)) { input.value = ''; return; }
    this.busy.set(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(buf);
      this.fileName.set(file.name);
      this.pageCount.set(doc.getPageCount());
      const { images, skipped } = await this.scan(doc);
      this.images.set(images);
      this.skipped.set(skipped);
      this.scanned.set(true);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      input.value = '';
    } finally {
      this.busy.set(false);
    }
  }

  downloadOne(img: FoundImg) {
    const ext = img.format === 'JPEG' ? 'jpg' : 'png';
    this.saveBlob(img.bytes, `page-${img.page}-img-${img.id}.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : 'png'}`);
  }

  downloadAll() {
    this.images().forEach((img, i) => {
      setTimeout(() => this.downloadOne(img), i * 600);
    });
  }

  reset() {
    this.fileName.set('');
    this.pageCount.set(0);
    this.images.set([]);
    this.skipped.set(0);
    this.scanned.set(false);
    this.error.set('');
  }

  readonly fileDragging = signal(false);

  onDragOverFile(ev: DragEvent): void {
    ev.preventDefault();
    this.fileDragging.set(true);
  }

  onDropFile(ev: DragEvent, input: HTMLInputElement): void {
    ev.preventDefault();
    this.fileDragging.set(false);
    const files = ev.dataTransfer?.files;
    if (files && files.length > 0) {
      input.files = files;
      input.dispatchEvent(new Event('change'));
    }
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private async scan(doc: PDFDocument): Promise<{ images: FoundImg[]; skipped: number }> {
    const images: FoundImg[] = [];
    const seen = new Set<number>();
    let skipped = 0;
    let id = 1;
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
      const resources = pages[p].node.Resources();
      if (!resources) continue;
      const xobj = resources.lookup(PDFName.of('XObject'));
      if (!(xobj instanceof PDFDict)) continue;
      for (const [, ref] of Array.from(xobj.entries())) {
        if (!(ref instanceof PDFRef) || seen.has(ref.objectNumber)) continue;
        seen.add(ref.objectNumber);
        const obj = doc.context.lookup(ref);
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.lookup(PDFName.of('Subtype')) as { toString?: () => string } | undefined;
        if (subtype?.toString?.() !== '/Image') continue;
        const w = (dict.lookup(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
        const h = (dict.lookup(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
        const filter = dict.lookup(PDFName.of('Filter'));
        const names = filter instanceof PDFArray
          ? filter.asArray().map((f) => (f as { toString?: () => string } | undefined)?.toString?.())
          : [(filter as { toString?: () => string } | undefined)?.toString?.()];
        if (names.includes('/DCTDecode')) {
          const bytes = obj.getContents();
          if (bytes.length > 0) {
            images.push({ id: id++, page: p + 1, width: w, height: h, format: 'JPEG', bytes });
          } else skipped++;
        } else if (names.includes('/FlateDecode')) {
          const png = await this.flateToPng(obj, w, h);
          if (png) images.push({ id: id++, page: p + 1, width: w, height: h, format: 'PNG', bytes: png });
          else skipped++;
        } else {
          skipped++;
        }
      }
    }
    return { images, skipped };
  }

  private async flateToPng(stream: PDFRawStream, w: number, h: number): Promise<Uint8Array | null> {
    try {
      if (!w || !h || w > 8000 || h > 8000) return null;
      const dict = stream.dict;
      const bpc = (dict.lookup(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
      if (bpc !== 8) return null;
      const cs = dict.lookup(PDFName.of('ColorSpace')) as { toString?: () => string } | undefined;
      const csName = cs?.toString?.();
      if (csName !== '/DeviceRGB' && csName !== '/DeviceGray') return null;
      const dp = dict.lookup(PDFName.of('DecodeParms'));
      if (dp) {
        const preds: number[] = [];
        const arr = dp instanceof PDFArray ? dp.asArray() : [dp];
        for (const d of arr) {
          if (d instanceof PDFDict) {
            const pv = (d.lookup(PDFName.of('Predictor')) as PDFNumber | undefined)?.asNumber?.() ?? 1;
            preds.push(pv);
          }
        }
        if (preds.some((p) => p !== 1)) return null;
      }
      const pixels = stream.getContents();
      const channels = csName === '/DeviceRGB' ? 3 : 1;
      if (pixels.length < w * h * channels) return null;
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        if (channels === 3) {
          img.data[o] = pixels[i * 3];
          img.data[o + 1] = pixels[i * 3 + 1];
          img.data[o + 2] = pixels[i * 3 + 2];
        } else {
          img.data[o] = img.data[o + 1] = img.data[o + 2] = pixels[i];
        }
        img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) return null;
      return new Uint8Array(await blob.arrayBuffer());
    } catch {
      return null;
    }
  }

  private saveBlob(bytes: Uint8Array, filename: string, mime: string) {
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = filename;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private validPdf(file: File): boolean {
    const okType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!okType) { this.error.set(this.t('labels.errNotPdf')); return false; }
    if (file.size > 50 * 1024 * 1024) { this.error.set(this.t('labels.errTooLarge')); return false; }
    return true;
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
