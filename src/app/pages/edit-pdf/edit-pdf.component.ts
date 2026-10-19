import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type EditKind = 'text' | 'image' | 'rect' | 'ink';

interface EditEl {
  id: number;
  kind: EditKind;
  page: number;
  xPct: number;
  yPct: number;
  text: string;
  fontSize: number;
  color: string;
  wPct: number;
  hPct: number;
  imgBytes: Uint8Array | null;
  imgMime: string;
  imgAspect: number;
}

@Component({
  selector: 'app-edit-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './edit-pdf.component.html',
  styleUrl: './edit-pdf.component.scss',
})
export class EditPdfComponent implements OnDestroy {
  readonly slug = 'edit-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-editor', 'annotate-pdf', 'add-text-to-pdf', 'create-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('drawPad');

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly elements = signal<EditEl[]>([]);

  readonly curKind = signal<EditKind>('text');
  readonly curPage = signal(1);
  readonly curX = signal(10);
  readonly curY = signal(70);
  readonly curText = signal('');
  readonly curFontSize = signal(14);
  readonly curColor = signal('black');
  readonly curW = signal(30);
  readonly curH = signal(10);
  readonly imgName = signal('');
  readonly imgReady = signal(false);
  readonly inkDirty = signal(false);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;
  private pendingImg: { bytes: Uint8Array; mime: string; aspect: number } | null = null;
  private drawing = false;
  private lastPt: { x: number; y: number } | null = null;
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

  setKind(k: EditKind) { this.curKind.set(k); this.error.set(''); }
  setPage(v: number) { this.curPage.set(Math.round(this.clampNum(v, 1, Math.max(1, this.pageCount())))); }
  setX(v: number) { this.curX.set(this.clampNum(v, 0, 100)); }
  setY(v: number) { this.curY.set(this.clampNum(v, 0, 100)); }
  setText(v: string) { this.curText.set(v.slice(0, 500)); }
  setFontSize(v: number) { this.curFontSize.set(this.clampNum(v, 6, 72)); }
  setColor(c: string) { this.curColor.set(c); }
  setW(v: number) { this.curW.set(this.clampNum(v, 1, 100)); }
  setH(v: number) { this.curH.set(this.clampNum(v, 1, 100)); }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.done.set(false);
    if (!file) return;
    if (!this.validPdf(file)) { input.value = ''; return; }
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(buf);
      this.pdfBytes = buf;
      this.fileName.set(file.name);
      this.pageCount.set(doc.getPageCount());
      this.elements.set([]);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async onImage(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.imgReady.set(false);
    this.pendingImg = null;
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.error.set(this.t('labels.errNotImage')); input.value = ''; return; }
    if (file.size > 20 * 1024 * 1024) { this.error.set(this.t('labels.errImgTooLarge')); input.value = ''; return; }
    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      let bytes = raw;
      let mime = file.type;
      if (file.type === 'image/webp' || file.type === 'image/gif') {
        bytes = await this.rasterize(raw, file.type);
        mime = 'image/png';
      }
      const aspect = await this.measureAspect(bytes, mime);
      this.pendingImg = { bytes, mime, aspect };
      this.imgName.set(file.name);
      this.imgReady.set(true);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      input.value = '';
    }
  }

  padDown(ev: PointerEvent) {
    const canvas = this.pad()?.nativeElement;
    if (!canvas) return;
    this.drawing = true;
    canvas.setPointerCapture(ev.pointerId);
    this.lastPt = this.padPos(ev, canvas);
  }

  padMove(ev: PointerEvent) {
    if (!this.drawing) return;
    const canvas = this.pad()?.nativeElement;
    if (!canvas || !this.lastPt) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = this.padPos(ev, canvas);
    ctx.strokeStyle = this.inkCss();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastPt.x, this.lastPt.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.lastPt = p;
    this.inkDirty.set(true);
  }

  padUp() {
    this.drawing = false;
    this.lastPt = null;
  }

  clearPad() {
    const canvas = this.pad()?.nativeElement;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.inkDirty.set(false);
  }

  async addElement() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.curKind() === 'text' && !this.curText().trim()) {
      this.error.set(this.t('labels.errNoText')); return;
    }
    if (this.curKind() === 'image' && !this.pendingImg) {
      this.error.set(this.t('labels.errNoImage')); return;
    }
    if (this.curKind() === 'ink' && !this.inkDirty()) {
      this.error.set(this.t('labels.errNoInk')); return;
    }
    this.error.set('');
    let imgBytes: Uint8Array | null = null;
    let imgMime = '';
    let imgAspect = 1;
    if (this.curKind() === 'image' && this.pendingImg) {
      imgBytes = this.pendingImg.bytes;
      imgMime = this.pendingImg.mime;
      imgAspect = this.pendingImg.aspect;
    }
    if (this.curKind() === 'ink') {
      const canvas = this.pad()?.nativeElement;
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) { this.error.set(this.t('labels.errProcess')); return; }
      imgBytes = new Uint8Array(await blob.arrayBuffer());
      imgAspect = canvas.width / Math.max(1, canvas.height);
    }
    const el: EditEl = {
      id: this.nextId++,
      kind: this.curKind(),
      page: Math.min(Math.max(this.curPage(), 1), this.pageCount()) - 1,
      xPct: this.curX(), yPct: this.curY(),
      text: this.curText().trim(),
      fontSize: this.curFontSize(),
      color: this.curColor(),
      wPct: this.curW(), hPct: this.curH(),
      imgBytes, imgMime, imgAspect,
    };
    this.elements.set([...this.elements(), el]);
    this.curText.set('');
    if (this.curKind() === 'ink') this.clearPad();
  }

  removeElement(id: number) {
    this.elements.set(this.elements().filter((e) => e.id !== id));
  }

  async apply() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.elements().length === 0) { this.error.set(this.t('labels.errNoEls')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const el of this.elements()) {
        const page = doc.getPages()[el.page];
        if (!page) continue;
        const { width, height } = page.getSize();
        const x = (el.xPct / 100) * width;
        const y = (el.yPct / 100) * height;
        const color = this.pickColor(el.color);
        if (el.kind === 'text') {
          page.drawText(el.text, { x, y, size: el.fontSize, font, color });
        } else if (el.kind === 'rect') {
          const rw = (el.wPct / 100) * width;
          const rh = (el.hPct / 100) * height;
          page.drawRectangle({ x, y, width: rw, height: rh, borderColor: color, borderWidth: 2 });
        } else if ((el.kind === 'image' || el.kind === 'ink') && el.imgBytes) {
          const embedded = el.imgMime === 'image/jpeg'
            ? await doc.embedJpg(new Uint8Array(el.imgBytes))
            : await doc.embedPng(new Uint8Array(el.imgBytes));
          const iw = (el.wPct / 100) * width;
          const ih = iw / el.imgAspect;
          page.drawImage(embedded, { x, y, width: iw, height: ih });
        }
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
    const base = this.fileName().replace(/\.pdf$/i, '');
    this.saveBlob(this.outBytes, `${base}-edited.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.elements.set([]);
    this.pendingImg = null;
    this.imgReady.set(false);
    this.imgName.set('');
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

  private padPos(ev: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * canvas.width,
      y: ((ev.clientY - r.top) / r.height) * canvas.height,
    };
  }

  private inkCss(): string {
    switch (this.curColor()) {
      case 'red': return '#b91c1c';
      case 'blue': return '#1d4ed8';
      case 'green': return '#15803d';
      default: return '#111111';
    }
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

  private async measureAspect(bytes: Uint8Array, mime: string): Promise<number> {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
      return img.naturalWidth / Math.max(1, img.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private pickColor(name: string) {
    switch (name) {
      case 'gray': return rgb(0.35, 0.35, 0.35);
      case 'blue': return rgb(0.1, 0.25, 0.75);
      case 'red': return rgb(0.7, 0.1, 0.1);
      case 'green': return rgb(0.1, 0.5, 0.2);
      case 'yellow': return rgb(0.95, 0.8, 0.2);
      default: return rgb(0, 0, 0);
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
