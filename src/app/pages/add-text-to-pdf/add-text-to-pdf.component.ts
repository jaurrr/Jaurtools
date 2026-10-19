import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type StampPos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'custom';

@Component({
  selector: 'app-add-text-to-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './add-text-to-pdf.component.html',
  styleUrl: './add-text-to-pdf.component.scss',
})
export class AddTextToPdfComponent implements OnDestroy {
  readonly slug = 'add-text-to-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['annotate-pdf', 'edit-pdf', 'pdf-editor', 'add-page-numbers-to-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly stampText = signal('');
  readonly pageMode = signal<'all' | 'one'>('all');
  readonly pageNum = signal(1);
  readonly position = signal<StampPos>('bc');
  readonly xPct = signal(50);
  readonly yPct = signal(10);
  readonly fontSize = signal(14);
  readonly inkColor = signal('black');
  readonly rotation = signal(0);
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

  readonly positions = computed<StampPos[]>(() =>
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

  setText(v: string) { this.stampText.set(v.slice(0, 500)); }
  setPageMode(m: 'all' | 'one') { this.pageMode.set(m); }
  setPageNum(v: number) { this.pageNum.set(Math.round(this.clampNum(v, 1, Math.max(1, this.pageCount())))); }
  setPosition(p: StampPos) { this.position.set(p); }
  setXPct(v: number) { this.xPct.set(this.clampNum(v, 0, 100)); }
  setYPct(v: number) { this.yPct.set(this.clampNum(v, 0, 100)); }
  setFontSize(v: number) { this.fontSize.set(this.clampNum(v, 6, 72)); }
  setInkColor(c: string) { this.inkColor.set(c); }
  setRotation(v: number) { this.rotation.set(this.clampNum(v, -90, 90)); }

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
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async stamp() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    const text = this.stampText().trim();
    if (!text) { this.error.set(this.t('labels.errNoText')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const fs = this.fontSize();
      const color = this.pickColor();
      const rot = degrees(this.rotation());
      const targets = this.pageMode() === 'all'
        ? pages.map((_, i) => i)
        : [Math.min(Math.max(this.pageNum() - 1, 0), pages.length - 1)];
      for (const i of targets) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const tw = font.widthOfTextAtSize(text, fs);
        const { x, y } = this.coords(width, height, tw, fs);
        page.drawText(text, { x, y, size: fs, font, color, rotate: rot });
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
    this.saveBlob(this.outBytes, `${base}-stamped.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.stampText.set('');
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

  private coords(w: number, h: number, tw: number, fs: number): { x: number; y: number } {
    const m = 36;
    switch (this.position()) {
      case 'tl': return { x: m, y: h - m - fs };
      case 'tc': return { x: (w - tw) / 2, y: h - m - fs };
      case 'tr': return { x: w - m - tw, y: h - m - fs };
      case 'ml': return { x: m, y: h / 2 };
      case 'mc': return { x: (w - tw) / 2, y: h / 2 };
      case 'mr': return { x: w - m - tw, y: h / 2 };
      case 'bl': return { x: m, y: m };
      case 'bc': return { x: (w - tw) / 2, y: m };
      case 'br': return { x: w - m - tw, y: m };
      default: return { x: (this.xPct() / 100) * w - tw / 2, y: (this.yPct() / 100) * h };
    }
  }

  private pickColor() {
    switch (this.inkColor()) {
      case 'gray': return rgb(0.35, 0.35, 0.35);
      case 'blue': return rgb(0.1, 0.25, 0.75);
      case 'red': return rgb(0.7, 0.1, 0.1);
      case 'green': return rgb(0.1, 0.5, 0.2);
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
