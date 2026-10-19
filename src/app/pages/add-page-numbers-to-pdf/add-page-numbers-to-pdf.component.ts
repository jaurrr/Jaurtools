import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type NumPosition = 'bl' | 'bc' | 'br' | 'tl' | 'tc' | 'tr';
type NumFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';

@Component({
  selector: 'app-add-page-numbers-to-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './add-page-numbers-to-pdf.component.html',
  styleUrl: './add-page-numbers-to-pdf.component.scss',
})
export class AddPageNumbersToPdfComponent implements OnDestroy {
  readonly slug = 'add-page-numbers-to-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-pdf', 'compress-pdf', 'organize-pdf-pages', 'delete-pdf-pages'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly origSizeKb = signal(0);
  readonly position = signal<NumPosition>('bc');
  readonly format = signal<NumFormat>('n-of-total');
  readonly startNum = signal(1);
  readonly fontSize = signal(11);
  readonly marginPt = signal(36);
  readonly inkColor = signal('gray');
  readonly skipFirst = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly positions = computed<NumPosition[]>(() => ['tl', 'tc', 'tr', 'bl', 'bc', 'br']);
  readonly formats = computed<NumFormat[]>(() => ['n', 'page-n', 'n-of-total', 'page-n-of-total']);

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

  setPosition(p: NumPosition) { this.position.set(p); }
  setFormat(f: NumFormat) { this.format.set(f); }
  setStartNum(v: number) { this.startNum.set(this.clampNum(v, 0, 99999)); }
  setFontSize(v: number) { this.fontSize.set(this.clampNum(v, 8, 24)); }
  setMargin(v: number) { this.marginPt.set(this.clampNum(v, 18, 72)); }
  setInkColor(c: string) { this.inkColor.set(c); }
  toggleSkipFirst() { this.skipFirst.set(!this.skipFirst()); }

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
      this.origSizeKb.set(Math.round((file.size / 1024) * 10) / 10);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async addNumbers() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const fs = this.fontSize();
      const m = this.marginPt();
      const color = this.pickColor();
      const total = pages.length;
      pages.forEach((page, i) => {
        if (this.skipFirst() && i === 0) return;
        const n = this.startNum() + i;
        const text = this.formatText(n, total);
        const { width, height } = page.getSize();
        const tw = font.widthOfTextAtSize(text, fs);
        let x = m;
        let y = m;
        switch (this.position()) {
          case 'bc': x = (width - tw) / 2; y = m; break;
          case 'br': x = width - m - tw; y = m; break;
          case 'tl': x = m; y = height - m - fs; break;
          case 'tc': x = (width - tw) / 2; y = height - m - fs; break;
          case 'tr': x = width - m - tw; y = height - m - fs; break;
          default: x = m; y = m;
        }
        page.drawText(text, { x, y, size: fs, font, color });
      });
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
    this.saveBlob(this.outBytes, this.stampedName(), 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
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

  private formatText(n: number, total: number): string {
    switch (this.format()) {
      case 'page-n': return `Page ${n}`;
      case 'n-of-total': return `${n} / ${total}`;
      case 'page-n-of-total': return `Page ${n} of ${total}`;
      default: return `${n}`;
    }
  }

  private pickColor() {
    switch (this.inkColor()) {
      case 'black': return rgb(0, 0, 0);
      case 'blue': return rgb(0.1, 0.25, 0.75);
      case 'red': return rgb(0.7, 0.1, 0.1);
      default: return rgb(0.35, 0.35, 0.35);
    }
  }

  private stampedName(): string {
    const base = this.fileName().replace(/\.pdf$/i, '');
    return `${base}-numbered.pdf`;
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
