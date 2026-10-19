import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  downloadBytes,
  fmtBytes,
  isPngFile,
  IMG_MAX_BYTES,
  PAGE_SIZES,
} from '../../utils/pdf-toolkit';

interface PngItem {
  id: number;
  name: string;
  bytes: Uint8Array;
  url: string;
  w: number;
  h: number;
}

type PageSizeOpt = 'fit' | 'a4' | 'letter';
type OrientOpt = 'portrait' | 'landscape';

@Component({
  selector: 'app-png-to-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './png-to-pdf.component.html',
  styleUrl: './png-to-pdf.component.scss',
})
export class PngToPdfComponent implements OnDestroy {
  readonly slug = 'png-to-pdf';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['jpg-to-pdf', 'pdf-to-png', 'merge-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly images = signal<PngItem[]>([]);
  readonly pageSize = signal<PageSizeOpt>('fit');
  readonly orient = signal<OrientOpt>('portrait');
  readonly marginMm = signal(10);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outSize = signal(0);

  readonly totalInput = computed(() => this.images().reduce((a, i) => a + i.bytes.length, 0));
  readonly outName = computed(() => `${baseName(this.images()[0]?.name ?? 'images')}.pdf`);

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
  fmt(n: number): string {
    return fmtBytes(n);
  }

  setPageSize(v: PageSizeOpt): void {
    this.pageSize.set(v);
  }
  setOrient(v: OrientOpt): void {
    this.orient.set(v);
  }
  setMargin(v: number): void {
    this.marginMm.set(Math.min(40, Math.max(0, Math.round(v))));
  }

  async onFilesSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.error.set('');
    this.status.set('');
    this.outSize.set(0);
    if (!files.length) return;
    let added = 0;
    for (const f of files) {
      if (!isPngFile(f)) {
        this.error.set(this.t('labels.errType'));
        continue;
      }
      if (f.size > IMG_MAX_BYTES) {
        this.error.set(this.t('labels.errSize'));
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const dims = await this.readDims(bytes);
      this.nextId++;
      this.images.update((arr) => [
        ...arr,
        { id: this.nextId, name: f.name, bytes, url: URL.createObjectURL(f), w: dims[0], h: dims[1] },
      ]);
      added++;
    }
    input.value = '';
    if (added > 0) this.status.set(this.t('labels.statusAdded').replace('{n}', String(added)));
  }

  moveUp(id: number): void {
    this.images.update((arr) => {
      const i = arr.findIndex((x) => x.id === id);
      if (i <= 0) return arr;
      const next = [...arr];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  moveDown(id: number): void {
    this.images.update((arr) => {
      const i = arr.findIndex((x) => x.id === id);
      if (i < 0 || i >= arr.length - 1) return arr;
      const next = [...arr];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
  }

  remove(id: number): void {
    this.images.update((arr) => {
      const item = arr.find((x) => x.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return arr.filter((x) => x.id !== id);
    });
  }

  clearAll(): void {
    for (const it of this.images()) URL.revokeObjectURL(it.url);
    this.images.set([]);
    this.outSize.set(0);
    this.status.set('');
  }

  async buildPdf(): Promise<void> {
    const items = this.images();
    if (!items.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const out = await PDFDocument.create();
      const margin = (this.marginMm() * 72) / 25.4;
      for (const it of items) {
        const img = await out.embedPng(it.bytes);
        const dims = img.scale(1);
        let pw = dims.width;
        let ph = dims.height;
        if (this.pageSize() !== 'fit') {
          const [sw, sh] = PAGE_SIZES[this.pageSize()] ?? PAGE_SIZES['a4'];
          pw = this.orient() === 'portrait' ? Math.min(sw, sh) : Math.max(sw, sh);
          ph = this.orient() === 'portrait' ? Math.max(sw, sh) : Math.min(sw, sh);
        }
        const page = out.addPage([pw, ph]);
        const availW = Math.max(1, pw - margin * 2);
        const availH = Math.max(1, ph - margin * 2);
        const s = Math.min(availW / dims.width, availH / dims.height);
        const dw = dims.width * s;
        const dh = dims.height * s;
        page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      }
      const bytes = await out.save();
      this.pdfBytes = bytes;
      this.outSize.set(bytes.length);
      this.status.set(this.t('labels.statusDone').replace('{n}', String(items.length)));
    } catch {
      this.error.set(this.t('labels.errBuild'));
    } finally {
      this.busy.set(false);
    }
  }

  download(): void {
    if (!this.pdfBytes) return;
    downloadBytes(this.document, this.pdfBytes, this.outName(), 'application/pdf');
  }

  ngOnDestroy(): void {
    this.clearAll();
    this.detachSeo();
  }

  private nextId = 0;
  private pdfBytes: Uint8Array | null = null;

  private readDims(bytes: Uint8Array): Promise<[number, number]> {
    return new Promise((resolve) => {
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const url = URL.createObjectURL(new Blob([ab], { type: 'image/png' }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve([img.naturalWidth || 1, img.naturalHeight || 1]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve([1, 1]);
      };
      img.src = url;
    });
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
