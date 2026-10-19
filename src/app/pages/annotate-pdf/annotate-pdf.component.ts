import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type AnnotType = 'note' | 'highlight' | 'rect' | 'ellipse' | 'line';
type AnnotPos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'custom';

interface DraftAnnot {
  id: number;
  type: AnnotType;
  page: number;
  pos: AnnotPos;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  x2Pct: number;
  y2Pct: number;
  text: string;
  color: string;
}

@Component({
  selector: 'app-annotate-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './annotate-pdf.component.html',
  styleUrl: './annotate-pdf.component.scss',
})
export class AnnotatePdfComponent implements OnDestroy {
  readonly slug = 'annotate-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['edit-pdf', 'add-text-to-pdf', 'pdf-editor', 'pdf-to-text'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly annots = signal<DraftAnnot[]>([]);

  readonly curType = signal<AnnotType>('note');
  readonly curPage = signal(1);
  readonly curPos = signal<AnnotPos>('mc');
  readonly curX = signal(20);
  readonly curY = signal(40);
  readonly curW = signal(40);
  readonly curH = signal(8);
  readonly curX2 = signal(80);
  readonly curY2 = signal(40);
  readonly curText = signal('');
  readonly curColor = signal('yellow');

  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  private pdfBytes: Uint8Array | null = null;
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

  readonly annotTypes = computed<AnnotType[]>(() => ['note', 'highlight', 'rect', 'ellipse', 'line']);
  readonly positions = computed<AnnotPos[]>(() =>
    ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br', 'custom']);

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

  setType(v: AnnotType) { this.curType.set(v); }
  setPage(v: number) { this.curPage.set(Math.round(this.clampNum(v, 1, Math.max(1, this.pageCount())))); }
  setPos(p: AnnotPos) { this.curPos.set(p); }
  setX(v: number) { this.curX.set(this.clampNum(v, 0, 100)); }
  setY(v: number) { this.curY.set(this.clampNum(v, 0, 100)); }
  setW(v: number) { this.curW.set(this.clampNum(v, 1, 100)); }
  setH(v: number) { this.curH.set(this.clampNum(v, 1, 100)); }
  setX2(v: number) { this.curX2.set(this.clampNum(v, 0, 100)); }
  setY2(v: number) { this.curY2.set(this.clampNum(v, 0, 100)); }
  setText(v: string) { this.curText.set(v.slice(0, 500)); }
  setColor(c: string) { this.curColor.set(c); }

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
      this.annots.set([]);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  addAnnot() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.curType() === 'note' && !this.curText().trim()) {
      this.error.set(this.t('labels.errNoText'));
      return;
    }
    this.error.set('');
    const a: DraftAnnot = {
      id: this.nextId++,
      type: this.curType(),
      page: Math.min(Math.max(this.curPage(), 1), this.pageCount()) - 1,
      pos: this.curPos(),
      xPct: this.curX(), yPct: this.curY(), wPct: this.curW(), hPct: this.curH(),
      x2Pct: this.curX2(), y2Pct: this.curY2(),
      text: this.curText().trim(), color: this.curColor(),
    };
    this.annots.set([...this.annots(), a]);
    this.curText.set('');
  }

  removeAnnot(id: number) {
    this.annots.set(this.annots().filter((a) => a.id !== id));
  }

  async apply() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.annots().length === 0) { this.error.set(this.t('labels.errNoAnnots')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      for (const a of this.annots()) {
        const page = doc.getPages()[a.page];
        if (!page) continue;
        const { width, height } = page.getSize();
        const ref = this.buildAnnot(doc, a, width, height);
        if (ref) page.node.addAnnot(doc.context.register(ref));
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
    this.saveBlob(this.outBytes, `${base}-annotated.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.annots.set([]);
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

  private buildAnnot(doc: PDFDocument, a: DraftAnnot, w: number, h: number) {
    const context = doc.context;
    const c = this.colorArr(a.color);
    const text = a.text || this.t('labels.defaultNote');
    const pos = this.resolvePos(a, w, h);
    const N = PDFName.of;
    switch (a.type) {
      case 'note': {
        const x = pos.x; const y = pos.y;
        return context.obj({
          Type: N('Annot'), Subtype: N('Text'),
          Rect: context.obj([x, y, x + 24, y + 24]),
          Contents: PDFHexString.fromText(text),
          Name: N('Comment'), C: context.obj(c),
        });
      }
      case 'highlight': {
        const x1 = pos.x; const y1 = pos.y;
        const x2 = x1 + pos.w; const y2 = y1 + pos.h;
        return context.obj({
          Type: N('Annot'), Subtype: N('Highlight'),
          Rect: context.obj([x1, y1, x2, y2]),
          QuadPoints: context.obj([x1, y2, x2, y2, x1, y1, x2, y1]),
          Contents: PDFHexString.fromText(text),
          C: context.obj(c),
        });
      }
      case 'rect':
      case 'ellipse': {
        const x1 = pos.x; const y1 = pos.y;
        const x2 = x1 + pos.w; const y2 = y1 + pos.h;
        return context.obj({
          Type: N('Annot'), Subtype: N(a.type === 'rect' ? 'Square' : 'Circle'),
          Rect: context.obj([x1, y1, x2, y2]),
          Contents: PDFHexString.fromText(text),
          C: context.obj(c), Border: context.obj([0, 0, 2]),
        });
      }
      case 'line': {
        const x1 = (a.xPct / 100) * w; const y1 = (a.yPct / 100) * h;
        const x2 = (a.x2Pct / 100) * w; const y2 = (a.y2Pct / 100) * h;
        const rx1 = Math.min(x1, x2); const ry1 = Math.min(y1, y2);
        const rx2 = Math.max(x1, x2); const ry2 = Math.max(y1, y2);
        return context.obj({
          Type: N('Annot'), Subtype: N('Line'),
          Rect: context.obj([rx1 - 4, ry1 - 4, rx2 + 4, ry2 + 4]),
          L: context.obj([x1, y1, x2, y2]),
          Contents: PDFHexString.fromText(text),
          C: context.obj(c), Border: context.obj([0, 0, 2]),
        });
      }
      default: return null;
    }
  }

  private resolvePos(a: DraftAnnot, w: number, h: number): { x: number; y: number; w: number; h: number } {
    const m = 36;
    const pw = (a.wPct / 100) * w;
    const ph = (a.hPct / 100) * h;
    switch (a.pos) {
      case 'tl': return { x: m, y: h - m - ph, w: pw, h: ph };
      case 'tc': return { x: (w - pw) / 2, y: h - m - ph, w: pw, h: ph };
      case 'tr': return { x: w - m - pw, y: h - m - ph, w: pw, h: ph };
      case 'ml': return { x: m, y: (h - ph) / 2, w: pw, h: ph };
      case 'mc': return { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph };
      case 'mr': return { x: w - m - pw, y: (h - ph) / 2, w: pw, h: ph };
      case 'bl': return { x: m, y: m, w: pw, h: ph };
      case 'bc': return { x: (w - pw) / 2, y: m, w: pw, h: ph };
      case 'br': return { x: w - m - pw, y: m, w: pw, h: ph };
      default: {
        const x = (a.xPct / 100) * w;
        const y = (a.yPct / 100) * h;
        return { x, y, w: pw, h: ph };
      }
    }
  }

  private colorArr(name: string): number[] {
    switch (name) {
      case 'red': return [1, 0.25, 0.25];
      case 'blue': return [0.25, 0.5, 1];
      case 'green': return [0.25, 0.8, 0.35];
      case 'black': return [0, 0, 0];
      default: return [1, 1, 0];
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
