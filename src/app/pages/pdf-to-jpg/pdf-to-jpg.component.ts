import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

interface RenderedPage {
  index: number;
  url: string;
  name: string;
}

@Component({
  selector: 'app-pdf-to-jpg',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-jpg.component.html',
  styleUrl: './pdf-to-jpg.component.scss',
})
export class PdfToJpgComponent implements OnDestroy {
  readonly slug = 'pdf-to-jpg';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-text', 'pdf-to-markdown', 'split-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly scale = signal(2);
  readonly quality = signal(85);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly pages = signal<RenderedPage[]>([]);

  private pdfBytes: Uint8Array | null = null;
  private rendered: Uint8Array[] = [];
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

  setScale(v: number): void {
    this.scale.set(v);
  }
  setQuality(v: number): void {
    this.quality.set(Math.min(100, Math.max(40, Math.round(v))));
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.clearPages();
    if (!this.isPdf(file)) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    this.pdfBytes = new Uint8Array(await file.arrayBuffer());
    this.fileName.set(file.name);
    this.pageCount.set(0);
  }

  async renderAll(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.clearPages();
    try {
      const lib = await this.loadPdfJs();
      const doc = await lib.getDocument({ data: this.pdfBytes.slice() }).promise;
      const n: number = doc.numPages;
      this.pageCount.set(n);
      const scale = this.scale();
      const q = this.quality() / 100;
      const base = this.baseName(this.fileName());
      const out: RenderedPage[] = [];
      const raws: Uint8Array[] = [];
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = this.document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, 'image/jpeg', q)
        );
        if (!blob) throw new Error('encode');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        raws.push(bytes);
        out.push({ index: i, url: URL.createObjectURL(blob), name: `${base}-page-${i}.jpg` });
        if (typeof page.cleanup === 'function') page.cleanup();
      }
      if (typeof doc.destroy === 'function') {
        try {
          await doc.destroy();
        } catch {
          /* best effort */
        }
      }
      this.rendered = raws;
      this.pages.set(out);
      this.status.set(this.t('labels.statusDone').replace('{n}', String(n)));
    } catch {
      this.error.set(this.t('labels.errRender'));
    } finally {
      this.busy.set(false);
    }
  }

  downloadPage(p: RenderedPage, i: number): void {
    const bytes = this.rendered[i];
    if (!bytes) return;
    this.downloadBytes(bytes, p.name, 'image/jpeg');
  }

  downloadZip(): void {
    if (!this.rendered.length || !this.pages().length) return;
    const files = this.pages().map((p, i) => ({ name: p.name, data: this.rendered[i] }));
    const zip = this.buildZip(files);
    this.downloadBytes(zip, `${this.baseName(this.fileName())}-images.zip`, 'application/zip');
  }

  ngOnDestroy(): void {
    this.clearPages();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clearPages(): void {
    for (const p of this.pages()) URL.revokeObjectURL(p.url);
    this.pages.set([]);
    this.rendered = [];
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private baseName(name: string): string {
    const dot = name.lastIndexOf('.');
    const b = dot > 0 ? name.slice(0, dot) : name;
    return b.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'pdf';
  }

  private downloadBytes(bytes: Uint8Array, name: string, type: string): void {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const url = URL.createObjectURL(new Blob([ab], { type }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  private async loadPdfJs(): Promise<any> {
    const lib = (await import('pdfjs-dist')) as unknown as {
      getDocument: (src: unknown) => { promise: Promise<any> };
      GlobalWorkerOptions: { workerSrc: string };
    };
    lib.GlobalWorkerOptions.workerSrc = 'assets/pdf-worker/pdf.worker.min.js';
    return lib;
  }

  private crcTable: Uint32Array | null = null;
  private crc32(data: Uint8Array): number {
    if (!this.crcTable) {
      const tbl = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tbl[n] = c >>> 0;
      }
      this.crcTable = tbl;
    }
    const tbl = this.crcTable;
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = tbl[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  private concatParts(parts: Uint8Array[]): Uint8Array {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  private buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const u32 = (n: number): Uint8Array => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, n >>> 0, true);
      return b;
    };
    const u16 = (n: number): Uint8Array => {
      const b = new Uint8Array(2);
      new DataView(b.buffer).setUint16(0, n, true);
      return b;
    };
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name);
      const crc = this.crc32(f.data);
      const lh = this.concatParts([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(nameB.length), u16(0), nameB, f.data,
      ]);
      local.push(lh);
      central.push(
        this.concatParts([
          u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0),
          u16(0), u32(crc), u32(f.data.length), u32(f.data.length),
          u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0),
          u32(offset), nameB,
        ])
      );
      offset += lh.length;
    }
    const cd = this.concatParts(central);
    const end = this.concatParts([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0),
    ]);
    return this.concatParts([...local, cd, end]);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
