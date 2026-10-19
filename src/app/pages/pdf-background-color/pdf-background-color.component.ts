import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, rgb, PDFName } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  downloadBytes,
  fmtBytes,
  hexToRgb,
  readPdfInput,
} from '../../utils/pdf-toolkit';

const PRESETS = ['#f8fafc', '#fef3c7', '#dcfce7', '#dbeafe', '#fae8ff', '#fee2e2', '#ffedd5', '#1e293b'];

@Component({
  selector: 'app-pdf-background-color',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-background-color.component.html',
  styleUrl: './pdf-background-color.component.scss',
})
export class PdfBackgroundColorComponent implements OnDestroy {
  readonly slug = 'pdf-background-color';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['watermark-pdf', 'pdf-metadata-editor', 'compress-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly color = signal('#dbeafe');
  readonly opacity = signal(100);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outSize = signal(0);

  readonly presets = PRESETS;
  readonly previewBg = computed(
    () => `color-mix(in srgb, ${this.color()} ${this.opacity()}%, white)`,
  );
  readonly outName = computed(() => `${baseName(this.fileName())}-background.pdf`);

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

  setColor(v: string): void {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) this.color.set(v.toLowerCase());
  }
  setOpacity(v: number): void {
    this.opacity.set(Math.min(100, Math.max(5, Math.round(v))));
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const res = await readPdfInput(input);
    this.error.set('');
    this.status.set('');
    this.outSize.set(0);
    if (!res.ok) {
      this.error.set(this.t(res.code === 'size' ? 'labels.errSize' : 'labels.errType'));
      input.value = '';
      return;
    }
    try {
      const doc = await PDFDocument.load(res.bytes);
      this.pageCount.set(doc.getPageCount());
    } catch {
      this.error.set(this.t('labels.errRead'));
      input.value = '';
      return;
    }
    this.pdfBytes = res.bytes;
    this.fileName.set(res.name);
  }

  async build(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.outSize.set(0);
    try {
      const [r, g, b] = hexToRgb(this.color());
      const op = this.opacity() / 100;
      const out = await PDFDocument.create();
      const count = this.pageCount();
      const srcBytes = this.pdfBytes as Uint8Array;
      const srcDoc = await PDFDocument.load(srcBytes.slice(), { updateMetadata: false });
      for (let i = 0; i < count; i++) {
        const blank = !this.hasContents(srcDoc, i);
        const embedded = blank ? null : (await out.embedPdf(srcBytes, [i]))[0];
        const w = embedded?.width ?? 595.28;
        const h = embedded?.height ?? 841.89;
        const page = out.addPage([w, h]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: w,
          height: h,
          color: rgb(r, g, b),
          opacity: op,
        });
        if (embedded) page.drawPage(embedded, { x: 0, y: 0, width: w, height: h });
      }
      const bytes = await out.save();
      this.outBytes = bytes;
      this.outSize.set(bytes.length);
      this.status.set(this.t('labels.statusDone').replace('{n}', String(count)));
    } catch {
      this.error.set(this.t('labels.errBuild'));
    } finally {
      this.busy.set(false);
    }
  }

  download(): void {
    if (!this.outBytes) return;
    downloadBytes(this.document, this.outBytes, this.outName(), 'application/pdf');
  }

  ngOnDestroy(): void {
    this.detachSeo();
  }

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;

  private hasContents(srcDoc: PDFDocument, index: number): boolean {
    try {
      return srcDoc.getPage(index).node.get(PDFName.of('Contents')) !== undefined;
    } catch {
      return false;
    }
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
