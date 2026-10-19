import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CropScope = 'all' | 'range';

@Component({
  selector: 'app-crop-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './crop-pdf.component.html',
  styleUrl: './crop-pdf.component.scss',
})
export class CropPdfComponent implements OnDestroy {
  readonly slug = 'crop-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['delete-pdf-pages', 'organize-pdf-pages', 'compress-pdf', 'add-page-numbers-to-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly firstW = signal(0);
  readonly firstH = signal(0);
  readonly top = signal(0);
  readonly right = signal(0);
  readonly bottom = signal(0);
  readonly left = signal(0);
  readonly scope = signal<CropScope>('all');
  readonly fromPage = signal(1);
  readonly toPage = signal(1);
  readonly resetCrop = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly newW = signal(0);
  readonly newH = signal(0);

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

  setSide(side: 'top' | 'right' | 'bottom' | 'left', v: number) {
    const val = this.clampNum(v, 0, 40);
    if (side === 'top') this.top.set(val);
    else if (side === 'right') this.right.set(val);
    else if (side === 'bottom') this.bottom.set(val);
    else this.left.set(val);
  }
  setScope(s: CropScope) { this.scope.set(s); }
  setFrom(v: number) { this.fromPage.set(Math.round(this.clampNum(v, 1, Math.max(1, this.pageCount())))); }
  setTo(v: number) { this.toPage.set(Math.round(this.clampNum(v, 1, Math.max(1, this.pageCount())))); }
  toggleReset() { this.resetCrop.set(!this.resetCrop()); }

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
      const { width, height } = doc.getPages()[0].getSize();
      this.firstW.set(Math.round(width * 100) / 100);
      this.firstH.set(Math.round(height * 100) / 100);
      this.toPage.set(doc.getPageCount());
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async crop() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (!this.resetCrop() && this.top() + this.bottom() + this.left() + this.right() === 0) {
      this.error.set(this.t('labels.errNoCrop')); return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      const pages = doc.getPages();
      let from = 0;
      let to = pages.length - 1;
      if (this.scope() === 'range') {
        from = Math.min(this.fromPage(), this.toPage()) - 1;
        to = Math.max(this.fromPage(), this.toPage()) - 1;
      }
      for (let i = from; i <= to; i++) {
        const page = pages[i];
        if (this.resetCrop()) {
          const mw = page.getMediaBox().width;
          const mh = page.getMediaBox().height;
          page.setCropBox(0, 0, mw, mh);
        } else {
          const { width, height } = page.getSize();
          const l = (this.left() / 100) * width;
          const r = (this.right() / 100) * width;
          const tp = (this.top() / 100) * height;
          const b = (this.bottom() / 100) * height;
          const nw = Math.max(10, width - l - r);
          const nh = Math.max(10, height - tp - b);
          page.setCropBox(l, b, nw, nh);
        }
      }
      const first = pages[from].getSize();
      this.newW.set(Math.round(first.width * 100) / 100);
      this.newH.set(Math.round(first.height * 100) / 100);
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
    this.saveBlob(this.outBytes, `${base}-cropped.pdf`, 'application/pdf');
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
