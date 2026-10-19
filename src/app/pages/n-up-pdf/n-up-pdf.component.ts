import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, PDFName } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  downloadBytes,
  fmtBytes,
  readPdfInput,
  PAGE_SIZES,
} from '../../utils/pdf-toolkit';

type PerSheet = 1 | 2 | 4 | 6 | 9;
type SheetSize = 'a4' | 'letter' | 'legal';
type OrientOpt = 'portrait' | 'landscape';

const GRIDS: Record<PerSheet, [number, number]> = {
  1: [1, 1],
  2: [2, 1],
  4: [2, 2],
  6: [3, 2],
  9: [3, 3],
};

@Component({
  selector: 'app-n-up-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './n-up-pdf.component.html',
  styleUrl: './n-up-pdf.component.scss',
})
export class NUpPdfComponent implements OnDestroy {
  readonly slug = 'n-up-pdf';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['merge-pdf', 'split-pdf', 'resize-pdf-pages'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly perSheet = signal<PerSheet>(2);
  readonly sheetSize = signal<SheetSize>('a4');
  readonly orient = signal<OrientOpt>('portrait');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly sheetCount = signal(0);
  readonly outSize = signal(0);

  readonly gridCells = computed(() => {
    const [cols, rows] = GRIDS[this.perSheet()];
    return Array.from({ length: cols * rows }, (_, i) => i);
  });
  readonly gridCols = computed(() => GRIDS[this.perSheet()][0]);
  readonly outName = computed(() => `${baseName(this.fileName())}-nup.pdf`);

  gridFor(n: number): [number, number] {
    return GRIDS[n as PerSheet];
  }
  cellsFor(n: number): number[] {
    const [c, r] = GRIDS[n as PerSheet];
    return Array.from({ length: c * r }, (_, i) => i);
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
  fmt(n: number): string {
    return fmtBytes(n);
  }

  setPerSheet(v: PerSheet): void {
    this.perSheet.set(v);
  }
  pickN(n: number): void {
    if (n === 1 || n === 2 || n === 4 || n === 6 || n === 9) this.perSheet.set(n);
  }
  setSheetSize(v: SheetSize): void {
    this.sheetSize.set(v);
  }
  setOrient(v: OrientOpt): void {
    this.orient.set(v);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const res = await readPdfInput(input);
    this.error.set('');
    this.status.set('');
    this.resetOutput();
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
    this.resetOutput();
    try {
      const n = this.perSheet();
      const [cols, rows] = GRIDS[n];
      const [sw, sh] = PAGE_SIZES[this.sheetSize()] ?? PAGE_SIZES['a4'];
      const sheetW = this.orient() === 'portrait' ? Math.min(sw, sh) : Math.max(sw, sh);
      const sheetH = this.orient() === 'portrait' ? Math.max(sw, sh) : Math.min(sw, sh);
      const gutter = 14;

      const out = await PDFDocument.create();
      const count = this.pageCount();
      const srcBytes = this.pdfBytes as Uint8Array;
      const srcDoc = await PDFDocument.load(srcBytes.slice(), { updateMetadata: false });
      const sheets = Math.ceil(count / n);
      for (let s = 0; s < sheets; s++) {
        const sheet = out.addPage([sheetW, sheetH]);
        const cellW = (sheetW - gutter * (cols + 1)) / cols;
        const cellH = (sheetH - gutter * (rows + 1)) / rows;
        for (let c = 0; c < n; c++) {
          const srcIdx = s * n + c;
          if (srcIdx >= count) break;
          if (!this.hasContents(srcDoc, srcIdx)) continue;
          const [embedded] = await out.embedPdf(srcBytes, [srcIdx]);
          const scale = Math.min(cellW / embedded.width, cellH / embedded.height);
          const dw = embedded.width * scale;
          const dh = embedded.height * scale;
          const col = c % cols;
          const row = Math.floor(c / cols);
          const x = gutter + col * (cellW + gutter) + (cellW - dw) / 2;
          const y = sheetH - gutter - row * (cellH + gutter) - (cellH + dh) / 2;
          sheet.drawPage(embedded, { x, y, width: dw, height: dh });
        }
      }
      const bytes = await out.save();
      this.pdfBytesOut = bytes;
      this.sheetCount.set(sheets);
      this.outSize.set(bytes.length);
      this.status.set(
        this.t('labels.statusDone').replace('{n}', String(count)).replace('{s}', String(sheets)),
      );
    } catch {
      this.error.set(this.t('labels.errBuild'));
    } finally {
      this.busy.set(false);
    }
  }

  download(): void {
    if (!this.pdfBytesOut) return;
    downloadBytes(this.document, this.pdfBytesOut, this.outName(), 'application/pdf');
  }

  ngOnDestroy(): void {
    this.detachSeo();
  }

  private pdfBytes: Uint8Array | null = null;
  private pdfBytesOut: Uint8Array | null = null;

  private hasContents(srcDoc: PDFDocument, index: number): boolean {
    try {
      return srcDoc.getPage(index).node.get(PDFName.of('Contents')) !== undefined;
    } catch {
      return false;
    }
  }

  private resetOutput(): void {
    this.pdfBytesOut = null;
    this.sheetCount.set(0);
    this.outSize.set(0);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
