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

type TargetSize = 'a4' | 'letter' | 'legal' | 'a5' | 'custom';
type FitMode = 'fit' | 'fill' | 'stretch';

@Component({
  selector: 'app-resize-pdf-pages',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './resize-pdf-pages.component.html',
  styleUrl: './resize-pdf-pages.component.scss',
})
export class ResizePdfPagesComponent implements OnDestroy {
  readonly slug = 'resize-pdf-pages';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['crop-pdf', 'n-up-pdf', 'rotate-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly srcSize = signal('');
  readonly target = signal<TargetSize>('a4');
  readonly mode = signal<FitMode>('fit');
  readonly customW = signal(210);
  readonly customH = signal(297);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outSize = signal(0);

  readonly targetDims = computed((): [number, number] => {
    if (this.target() === 'custom') {
      const w = (Math.min(1200, Math.max(10, this.customW())) * 72) / 25.4;
      const h = (Math.min(1200, Math.max(10, this.customH())) * 72) / 25.4;
      return [w, h];
    }
    return PAGE_SIZES[this.target()] ?? PAGE_SIZES['a4'];
  });
  readonly targetLabel = computed(() => {
    const [w, h] = this.targetDims();
    return `${Math.round((w * 25.4) / 72)} × ${Math.round((h * 25.4) / 72)} mm`;
  });
  readonly outName = computed(() => `${baseName(this.fileName())}-resized.pdf`);

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
    return typeof raw === 'string' ? raw : '';
  }
  fmt(n: number): string {
    return fmtBytes(n);
  }

  setTarget(v: TargetSize): void {
    this.target.set(v);
  }
  pickTarget(s: string): void {
    if (s === 'a4' || s === 'letter' || s === 'legal' || s === 'a5' || s === 'custom') this.target.set(s);
  }
  setMode(v: FitMode): void {
    this.mode.set(v);
  }
  setCustomW(v: number): void {
    this.customW.set(Math.min(1200, Math.max(10, Math.round(v || 0))));
  }
  setCustomH(v: number): void {
    this.customH.set(Math.min(1200, Math.max(10, Math.round(v || 0))));
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
      const p0 = doc.getPage(0);
      const { width, height } = p0.getSize();
      this.srcSize.set(`${Math.round((width * 25.4) / 72)} × ${Math.round((height * 25.4) / 72)} mm`);
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
      const [tw, th] = this.targetDims();
      const mode = this.mode();
      const out = await PDFDocument.create();
      const count = this.pageCount();
      const srcBytes = this.pdfBytes as Uint8Array;
      const srcDoc = await PDFDocument.load(srcBytes.slice(), { updateMetadata: false });
      for (let i = 0; i < count; i++) {
        const page = out.addPage([tw, th]);
        if (!this.hasContents(srcDoc, i)) continue;
        const [embedded] = await out.embedPdf(srcBytes, [i]);
        const sw = embedded.width;
        const sh = embedded.height;
        let sx = tw / sw;
        let sy = th / sh;
        if (mode === 'fit') {
          const s = Math.min(sx, sy);
          sx = s;
          sy = s;
        } else if (mode === 'fill') {
          const s = Math.max(sx, sy);
          sx = s;
          sy = s;
        }
        const dw = sw * sx;
        const dh = sh * sy;
        page.drawPage(embedded, { x: (tw - dw) / 2, y: (th - dh) / 2, width: dw, height: dh });
      }
      const bytes = await out.save();
      this.outBytes = bytes;
      this.outSize.set(bytes.length);
      this.status.set(
        this.t('labels.statusDone').replace('{n}', String(count)).replace('{t}', this.targetLabel()),
      );
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
