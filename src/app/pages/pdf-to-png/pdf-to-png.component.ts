import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  buildZip,
  downloadBytes,
  fmtBytes,
  loadPdfJs,
  readPdfInput,
} from '../../utils/pdf-toolkit';

interface RenderedPage {
  index: number;
  url: string;
  name: string;
  size: number;
}

@Component({
  selector: 'app-pdf-to-png',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-png.component.html',
  styleUrl: './pdf-to-png.component.scss',
})
export class PdfToPngComponent implements OnDestroy {
  readonly slug = 'pdf-to-png';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['pdf-to-jpg', 'pdf-to-text', 'png-to-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly fileSize = signal(0);
  readonly pageCount = signal(0);
  readonly scale = signal(2);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly donePages = signal(0);
  readonly pages = signal<RenderedPage[]>([]);

  readonly totalSize = computed(() => this.pages().reduce((a, p) => a + p.size, 0));
  readonly progress = computed(() =>
    this.pageCount() > 0 ? Math.round((this.donePages() / this.pageCount()) * 100) : 0,
  );

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

  setScale(v: number): void {
    this.scale.set(v);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const res = await readPdfInput(input);
    this.error.set('');
    this.status.set('');
    this.clearPages();
    if (!res.ok) {
      this.error.set(this.t(res.code === 'size' ? 'labels.errSize' : 'labels.errType'));
      input.value = '';
      return;
    }
    this.pdfBytes = res.bytes;
    this.fileName.set(res.name);
    this.fileSize.set(res.bytes.length);
    this.pageCount.set(0);
  }

  async renderAll(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.clearPages();
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: this.pdfBytes.slice() }).promise;
      const n: number = doc.numPages;
      this.pageCount.set(n);
      this.donePages.set(0);
      const scale = this.scale();
      const base = baseName(this.fileName());
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
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('encode');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        raws.push(bytes);
        out.push({
          index: i,
          url: URL.createObjectURL(blob),
          name: `${base}-page-${i}.png`,
          size: bytes.length,
        });
        this.donePages.set(i);
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
    downloadBytes(this.document, bytes, p.name, 'image/png');
  }

  downloadZip(): void {
    if (!this.rendered.length || !this.pages().length) return;
    const files = this.pages().map((p, i) => ({ name: p.name, data: this.rendered[i] }));
    const zip = buildZip(files);
    downloadBytes(this.document, zip, `${baseName(this.fileName())}-png.zip`, 'application/zip');
  }

  ngOnDestroy(): void {
    this.clearPages();
    this.detachSeo();
  }

  private pdfBytes: Uint8Array | null = null;
  private rendered: Uint8Array[] = [];

  private clearPages(): void {
    for (const p of this.pages()) URL.revokeObjectURL(p.url);
    this.pages.set([]);
    this.rendered = [];
    this.donePages.set(0);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
