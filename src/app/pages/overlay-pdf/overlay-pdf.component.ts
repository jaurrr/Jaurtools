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
} from '../../utils/pdf-toolkit';

type ScaleMode = 'fit' | 'actual';
type PosOpt = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

@Component({
  selector: 'app-overlay-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './overlay-pdf.component.html',
  styleUrl: './overlay-pdf.component.scss',
})
export class OverlayPdfComponent implements OnDestroy {
  readonly slug = 'overlay-pdf';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['watermark-pdf', 'merge-pdf', 'sign-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly baseName$ = signal('');
  readonly basePages = signal(0);
  readonly ovName = signal('');
  readonly ovPages = signal(0);
  readonly scaleMode = signal<ScaleMode>('fit');
  readonly pos = signal<PosOpt>('center');
  readonly opacity = signal(60);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outSize = signal(0);

  readonly ready = computed(() => this.basePages() > 0 && this.ovPages() > 0);
  readonly outName = computed(() => `${baseName(this.baseName$())}-overlay.pdf`);

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

  setScaleMode(v: ScaleMode): void {
    this.scaleMode.set(v);
  }
  setPos(v: PosOpt): void {
    this.pos.set(v);
  }
  setOpacity(v: number): void {
    this.opacity.set(Math.min(100, Math.max(5, Math.round(v))));
  }

  async onBaseSelected(ev: Event): Promise<void> {
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
      this.basePages.set(doc.getPageCount());
    } catch {
      this.error.set(this.t('labels.errRead'));
      input.value = '';
      return;
    }
    this.baseBytes = res.bytes;
    this.baseName$.set(res.name);
  }

  async onOverlaySelected(ev: Event): Promise<void> {
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
      this.ovPages.set(doc.getPageCount());
    } catch {
      this.error.set(this.t('labels.errRead'));
      input.value = '';
      return;
    }
    this.ovBytes = res.bytes;
    this.ovName.set(res.name);
  }

  async build(): Promise<void> {
    if (!this.baseBytes || !this.ovBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.resetOutput();
    try {
      const baseDoc = await PDFDocument.load(this.baseBytes);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(baseDoc, baseDoc.getPageIndices());
      const ovCount = this.ovPages();
      const op = this.opacity() / 100;
      const ovBytes = this.ovBytes as Uint8Array;
      const ovDoc = await PDFDocument.load(ovBytes.slice(), { updateMetadata: false });
      for (let i = 0; i < copied.length; i++) {
        const page = out.addPage(copied[i]);
        if (!this.hasContents(ovDoc, i % ovCount)) continue;
        const [embedded] = await out.embedPdf(ovBytes, [i % ovCount]);
        const { width: pw, height: ph } = page.getSize();
        let dw = embedded.width;
        let dh = embedded.height;
        if (this.scaleMode() === 'fit') {
          const s = Math.min(pw / embedded.width, ph / embedded.height);
          dw = embedded.width * s;
          dh = embedded.height * s;
        }
        const { x, y } = this.place(pw, ph, dw, dh);
        page.drawPage(embedded, { x, y, width: dw, height: dh, opacity: op });
      }
      const bytes = await out.save();
      this.outBytes = bytes;
      this.outSize.set(bytes.length);
      this.status.set(this.t('labels.statusDone').replace('{n}', String(copied.length)));
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

  private baseBytes: Uint8Array | null = null;
  private ovBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;

  private hasContents(srcDoc: PDFDocument, index: number): boolean {
    try {
      return srcDoc.getPage(index).node.get(PDFName.of('Contents')) !== undefined;
    } catch {
      return false;
    }
  }

  private place(pw: number, ph: number, dw: number, dh: number): { x: number; y: number } {
    const m = 24;
    switch (this.pos()) {
      case 'top-left':
        return { x: m, y: ph - dh - m };
      case 'top-right':
        return { x: pw - dw - m, y: ph - dh - m };
      case 'bottom-left':
        return { x: m, y: m };
      case 'bottom-right':
        return { x: pw - dw - m, y: m };
      default:
        return { x: (pw - dw) / 2, y: (ph - dh) / 2 };
    }
  }

  private resetOutput(): void {
    this.outBytes = null;
    this.outSize.set(0);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
