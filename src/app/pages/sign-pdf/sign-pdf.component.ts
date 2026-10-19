import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  AfterViewInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

type SigMode = 'draw' | 'type';

@Component({
  selector: 'app-sign-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sign-pdf.component.html',
  styleUrl: './sign-pdf.component.scss',
})
export class SignPdfComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'sign-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fill-pdf-form', 'watermark-pdf', 'redact-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sigMode = signal<SigMode>('draw');
  readonly typedName = signal('');
  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly pageNum = signal(1);
  readonly xPct = signal(50);
  readonly yPct = signal(80);
  readonly wPct = signal(30);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly sigUrl = signal('');

  private pdfBytes: Uint8Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  ngAfterViewInit(): void {
    this.canvas = this.document.getElementById('sign-canvas') as HTMLCanvasElement | null;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.resetCanvas();
    }
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

  setSigMode(m: SigMode): void {
    this.sigMode.set(m);
    if (m === 'type') this.renderTyped();
    else this.resetCanvas();
  }
  setTypedName(v: string): void {
    this.typedName.set(v);
    this.renderTyped();
  }
  setPageNum(v: number): void {
    const n = this.pageCount();
    this.pageNum.set(n ? Math.min(n, Math.max(1, Math.round(v) || 1)) : 1);
  }
  setXPct(v: number): void {
    this.xPct.set(Math.min(100, Math.max(0, Math.round(v))));
  }
  setYPct(v: number): void {
    this.yPct.set(Math.min(100, Math.max(0, Math.round(v))));
  }
  setWPct(v: number): void {
    this.wPct.set(Math.min(80, Math.max(10, Math.round(v))));
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
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
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(data, { ignoreEncryption: true });
      this.pdfBytes = data;
      this.fileName.set(file.name);
      this.pageCount.set(doc.getPageCount());
      this.pageNum.set(doc.getPageCount());
    } catch {
      this.error.set(this.t('labels.errParse'));
      this.pdfBytes = null;
    }
  }

  clearSig(): void {
    if (this.sigMode() === 'type') this.renderTyped();
    else this.resetCanvas();
  }

  onPointerDown(ev: PointerEvent): void {
    if (this.sigMode() !== 'draw' || !this.ctx || !this.canvas) return;
    ev.preventDefault();
    this.drawing = true;
    this.last = this.pos(ev);
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.canvas.setPointerCapture(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.drawing || !this.ctx || !this.canvas) return;
    ev.preventDefault();
    const p = this.pos(ev);
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.last = p;
  }

  onPointerUp(): void {
    this.drawing = false;
    this.last = null;
    this.refreshPreview();
  }

  async placeAndDownload(): Promise<void> {
    if (!this.pdfBytes || !this.canvas || this.busy()) return;
    if (!this.hasInk()) {
      this.error.set(this.t('labels.errEmpty'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const png = await new Promise<Uint8Array>((resolve, reject) => {
        this.canvas?.toBlob(async (b) => {
          if (!b) {
            reject(new Error('encode'));
            return;
          }
          resolve(new Uint8Array(await b.arrayBuffer()));
        }, 'image/png');
      });
      const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      const n = doc.getPageCount();
      const idx = Math.min(n, Math.max(1, this.pageNum())) - 1;
      const page = doc.getPage(idx);
      const { width, height } = page.getSize();
      const img = await doc.embedPng(png);
      const sigW = (this.wPct() / 100) * width;
      const sigH = (sigW * img.height) / img.width;
      const cx = (this.xPct() / 100) * width;
      const cyFromTop = (this.yPct() / 100) * height;
      const x = Math.min(width - sigW, Math.max(0, cx - sigW / 2));
      const y = Math.min(height - sigH, Math.max(0, height - cyFromTop - sigH / 2));
      page.drawImage(img, { x, y, width: sigW, height: sigH });
      const bytes = await doc.save({ useObjectStreams: true });
      this.downloadBytes(bytes, this.suffixed(this.fileName(), '-signed'), 'application/pdf');
      this.status.set(
        this.t('labels.statusDone').replace('{p}', String(idx + 1))
      );
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private pos(ev: PointerEvent): { x: number; y: number } {
    const rect = (ev.target as HTMLCanvasElement).getBoundingClientRect();
    const sx = 600 / rect.width;
    const sy = 220 / rect.height;
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  }

  private resetCanvas(): void {
    if (!this.canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, 600, 220);
    this.refreshPreview();
  }

  private renderTyped(): void {
    if (!this.canvas || !this.ctx) return;
    const c = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 600, 220);
    const name = this.typedName().trim() || this.t('labels.typePh');
    ctx.font = '64px "Segoe Script", "Brush Script MT", cursive';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 28), 300, 112, 560);
    this.refreshPreview();
  }

  private refreshPreview(): void {
    if (this.canvas) this.sigUrl.set(this.canvas.toDataURL('image/png'));
  }

  private hasInk(): boolean {
    if (!this.ctx || !this.canvas) return false;
    const d = this.ctx.getImageData(0, 0, 600, 220).data;
    for (let i = 3; i < d.length; i += 16) {
      if (d[i] > 10) return true;
    }
    return false;
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private suffixed(name: string, suffix: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix + '.pdf';
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
