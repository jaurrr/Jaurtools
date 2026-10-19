import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CreateTab = 'text' | 'images';

interface ImgItem {
  id: number;
  name: string;
  bytes: Uint8Array;
  mime: string;
}

@Component({
  selector: 'app-create-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './create-pdf.component.html',
  styleUrl: './create-pdf.component.scss',
})
export class CreatePdfComponent implements OnDestroy {
  readonly slug = 'create-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['jpg-to-pdf', 'merge-pdf', 'edit-pdf', 'pdf-editor'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly tab = signal<CreateTab>('text');
  readonly docTitle = signal('');
  readonly docAuthor = signal('');
  readonly bodyText = signal('');
  readonly pageSize = signal<'a4' | 'letter'>('a4');
  readonly fontSize = signal(12);
  readonly marginPt = signal(72);
  readonly images = signal<ImgItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

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

  setTab(tb: CreateTab) { this.tab.set(tb); }
  setTitle(v: string) { this.docTitle.set(v.slice(0, 200)); }
  setAuthor(v: string) { this.docAuthor.set(v.slice(0, 200)); }
  setBody(v: string) { this.bodyText.set(v.slice(0, 200000)); }
  setPageSize(s: 'a4' | 'letter') { this.pageSize.set(s); }
  setFontSize(v: number) { this.fontSize.set(this.clampNum(v, 8, 24)); }
  setMargin(v: number) { this.marginPt.set(this.clampNum(v, 36, 144)); }

  async onImages(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.error.set('');
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) continue;
      try {
        const raw = new Uint8Array(await file.arrayBuffer());
        let bytes = raw;
        let mime = file.type;
        if (file.type === 'image/webp' || file.type === 'image/gif') {
          bytes = await this.rasterize(raw, file.type);
          mime = 'image/png';
        }
        this.images.set([...this.images(), { id: this.nextId++, name: file.name, bytes, mime }]);
      } catch {
        continue;
      }
    }
    input.value = '';
  }

  removeImage(id: number) {
    this.images.set(this.images().filter((i) => i.id !== id));
  }

  moveImage(id: number, dir: -1 | 1) {
    const arr = [...this.images()];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.images.set(arr);
  }

  async create() {
    this.error.set('');
    this.done.set(false);
    if (this.tab() === 'text' && !this.bodyText().trim()) {
      this.error.set(this.t('labels.errNoText')); return;
    }
    if (this.tab() === 'images' && this.images().length === 0) {
      this.error.set(this.t('labels.errNoImages')); return;
    }
    this.busy.set(true);
    try {
      const doc = await PDFDocument.create();
      if (this.docTitle().trim()) doc.setTitle(this.docTitle().trim());
      if (this.docAuthor().trim()) doc.setAuthor(this.docAuthor().trim());
      doc.setProducer('JaurTools');
      if (this.tab() === 'text') {
        await this.buildTextPages(doc);
      } else {
        await this.buildImagePages(doc);
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
    this.saveBlob(this.outBytes, 'jaurtools-document.pdf', 'application/pdf');
  }

  reset() {
    this.outBytes = null;
    this.bodyText.set('');
    this.docTitle.set('');
    this.docAuthor.set('');
    this.images.set([]);
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

  private pageDims(): { w: number; h: number } {
    return this.pageSize() === 'a4' ? { w: 595.28, h: 841.89 } : { w: 612, h: 792 };
  }

  private async buildTextPages(doc: PDFDocument) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const { w, h } = this.pageDims();
    const margin = this.marginPt();
    const fs = this.fontSize();
    const lineH = fs * 1.45;
    const usableW = w - margin * 2;
    const usableH = h - margin * 2;
    const black = rgb(0, 0, 0);

    const lines: { text: string; bold: boolean; size: number }[] = [];
    if (this.docTitle().trim()) {
      lines.push({ text: this.docTitle().trim(), bold: true, size: Math.min(24, fs + 8) });
      lines.push({ text: '', bold: false, size: fs });
    }
    for (const para of this.bodyText().split('\n')) {
      if (!para.trim()) { lines.push({ text: '', bold: false, size: fs }); continue; }
      let current = '';
      for (const word of para.split(/\s+/)) {
        const trial = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(trial, fs) > usableW && current) {
          lines.push({ text: current, bold: false, size: fs });
          current = word;
        } else {
          current = trial;
        }
      }
      if (current) lines.push({ text: current, bold: false, size: fs });
    }

    let page = doc.addPage([w, h]);
    let y = h - margin;
    for (const ln of lines) {
      const lh = ln.size * 1.45;
      if (y - lh < margin) {
        page = doc.addPage([w, h]);
        y = h - margin;
      }
      if (ln.text) {
        page.drawText(ln.text, {
          x: margin, y: y - lh, size: ln.size,
          font: ln.bold ? bold : font, color: black, lineHeight: lh,
        });
      }
      y -= ln.size ? lh : lineH;
    }
    void usableH;
  }

  private async buildImagePages(doc: PDFDocument) {
    const { w, h } = this.pageDims();
    const margin = 36;
    for (const item of this.images()) {
      const embedded = item.mime === 'image/jpeg'
        ? await doc.embedJpg(new Uint8Array(item.bytes))
        : await doc.embedPng(new Uint8Array(item.bytes));
      const iw = embedded.width;
      const ih = embedded.height;
      const scale = Math.min((w - margin * 2) / iw, (h - margin * 2) / ih, 1);
      const dw = iw * scale;
      const dh = ih * scale;
      const page = doc.addPage([w, h]);
      page.drawImage(embedded, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
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
