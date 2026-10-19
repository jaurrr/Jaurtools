import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ImgItem {
  id: number;
  name: string;
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-jpg-to-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './jpg-to-pdf.component.html',
  styleUrl: './jpg-to-pdf.component.scss',
})
export class JpgToPdfComponent implements OnDestroy {
  readonly slug = 'jpg-to-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['create-pdf', 'compress-pdf', 'merge-pdf', 'extract-images-from-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly images = signal<ImgItem[]>([]);
  readonly pageSize = signal<'a4' | 'letter' | 'match'>('a4');
  readonly marginPt = signal(36);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  private outBytes: Uint8Array | null = null;
  private nextId = 1;

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

  setPageSize(s: 'a4' | 'letter' | 'match') { this.pageSize.set(s); }
  setMargin(v: number) { this.marginPt.set(this.clampNum(v, 0, 144)); }

  async onImages(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.error.set('');
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) continue;
      try {
        const raw = new Uint8Array(await file.arrayBuffer());
        let bytes = raw;
        let mime = file.type;
        if (file.type === 'image/webp' || file.type === 'image/gif') {
          bytes = await this.rasterize(raw, file.type);
          mime = 'image/png';
        }
        const dims = await this.measure(bytes, mime);
        this.images.set([...this.images(), {
          id: this.nextId++, name: file.name, bytes, mime,
          width: dims.w, height: dims.h,
        }]);
      } catch {
        continue;
      }
    }
    input.value = '';
  }

  removeImage(id: number) {
    this.images.set(this.images().filter((i) => i.id !== id));
  }

  moveImage(id: number, dir: -1 | 1) {
    const arr = [...this.images()];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.images.set(arr);
  }

  async create() {
    if (this.images().length === 0) { this.error.set(this.t('labels.errNoImages')); return; }
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    try {
      const doc = await PDFDocument.create();
      doc.setProducer('JaurTools');
      const margin = this.marginPt();
      for (const item of this.images()) {
        const embedded = item.mime === 'image/jpeg'
          ? await doc.embedJpg(new Uint8Array(item.bytes))
          : await doc.embedPng(new Uint8Array(item.bytes));
        const iw = embedded.width;
        const ih = embedded.height;
        let pw: number;
        let ph: number;
        if (this.pageSize() === 'match') {
          const scaleTo = 595.28;
          const s = Math.min(1, scaleTo / Math.max(iw, ih));
          pw = Math.max(72, iw * s);
          ph = Math.max(72, ih * s);
        } else {
          const dims = this.pageSize() === 'a4' ? { w: 595.28, h: 841.89 } : { w: 612, h: 792 };
          pw = dims.w;
          ph = dims.h;
        }
        const scale = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih, 1);
        const dw = iw * scale;
        const dh = ih * scale;
        const page = doc.addPage([pw, ph]);
        page.drawImage(embedded, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      }
      this.outBytes = await doc.save({ useObjectStreams: true });
      this.done.set(true);
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  download() {
    if (!this.outBytes) return;
    this.saveBlob(this.outBytes, 'images.pdf', 'application/pdf');
  }

  reset() {
    this.outBytes = null;
    this.images.set([]);
    this.done.set(false);
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

  private async rasterize(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<Uint8Array<ArrayBuffer>> {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
      const canvas = this.document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('raster');
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async measure(bytes: Uint8Array, mime: string): Promise<{ w: number; h: number }> {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
      return { w: img.naturalWidth, h: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
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
