import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CompressMode = 'recommended' | 'strong' | 'target';

@Component({
  selector: 'app-compress-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './compress-pdf.component.html',
  styleUrl: './compress-pdf.component.scss',
})
export class CompressPdfComponent implements OnDestroy {
  readonly slug = 'compress-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-pdf', 'jpg-to-pdf', 'delete-pdf-pages', 'organize-pdf-pages'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly origKb = signal(0);
  readonly mode = signal<CompressMode>('recommended');
  readonly targetKb = signal(200);
  readonly busy = signal(false);
  readonly progress = signal(0);
  readonly error = signal('');
  readonly done = signal(false);
  readonly newKb = signal(0);
  readonly savedPct = signal(0);
  readonly imagesHit = signal(0);
  readonly targetMet = signal(false);

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

  readonly modes = computed<CompressMode[]>(() => ['recommended', 'strong', 'target']);

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

  setMode(m: CompressMode) { this.mode.set(m); }
  setTargetKb(v: number) { this.targetKb.set(Math.round(this.clampNum(v, 50, 10240))); }

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
      this.origKb.set(Math.round((file.size / 1024) * 10) / 10);
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async compress() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    this.progress.set(0);
    try {
      const orig = this.pdfBytes;
      let best: Uint8Array | null = null;
      let bestHit = 0;
      if (this.mode() === 'recommended') {
        const r = await this.attempt(orig, 1600, 0.7);
        best = r.bytes; bestHit = r.hit;
        this.progress.set(100);
      } else if (this.mode() === 'strong') {
        const r = await this.attempt(orig, 900, 0.45);
        best = r.bytes; bestHit = r.hit;
        this.progress.set(100);
      } else {
        const target = this.targetKb() * 1024;
        const steps = [
          { maxDim: 1920, q: 0.75 }, { maxDim: 1600, q: 0.65 },
          { maxDim: 1280, q: 0.55 }, { maxDim: 1024, q: 0.45 },
          { maxDim: 800, q: 0.35 }, { maxDim: 640, q: 0.28 },
        ];
        let i = 0;
        for (const s of steps) {
          const r = await this.attempt(orig, s.maxDim, s.q);
          if (!best || r.bytes.length < best.length) { best = r.bytes; bestHit = r.hit; }
          i++;
          this.progress.set(Math.round((i / steps.length) * 100));
          if (r.bytes.length <= target) break;
        }
      }
      if (!best) throw new Error('empty');
      this.outBytes = best;
      const newKb = Math.round((best.length / 1024) * 10) / 10;
      this.newKb.set(newKb);
      const pct = this.origKb() > 0 ? Math.round(((this.origKb() - newKb) / this.origKb()) * 1000) / 10 : 0;
      this.savedPct.set(pct);
      this.imagesHit.set(bestHit);
      this.targetMet.set(this.mode() !== 'target' || best.length <= this.targetKb() * 1024);
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
    this.saveBlob(this.outBytes, `${base}-compressed.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.done.set(false);
    this.error.set('');
    this.progress.set(0);
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

  private async attempt(orig: Uint8Array, maxDim: number, quality: number): Promise<{ bytes: Uint8Array; hit: number }> {
    const doc = await PDFDocument.load(orig.slice());
    const hit = await this.recompressImages(doc, maxDim, quality);
    const bytes = await doc.save({ useObjectStreams: true });
    return { bytes, hit };
  }

  private async recompressImages(doc: PDFDocument, maxDim: number, quality: number): Promise<number> {
    let count = 0;
    for (const page of doc.getPages()) {
      const resources = page.node.Resources();
      if (!resources) continue;
      const xobj = resources.lookup(PDFName.of('XObject'));
      if (!(xobj instanceof PDFDict)) continue;
      for (const [key, ref] of Array.from(xobj.entries())) {
        const obj = doc.context.lookup(ref);
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.lookup(PDFName.of('Subtype')) as { toString?: () => string } | undefined;
        if (subtype?.toString?.() !== '/Image') continue;
        const filter = dict.lookup(PDFName.of('Filter'));
        const names = filter instanceof PDFArray
          ? filter.asArray().map((f) => (f as { toString?: () => string } | undefined)?.toString?.())
          : [(filter as { toString?: () => string } | undefined)?.toString?.()];
        if (!names.includes('/DCTDecode')) continue;
        try {
          const small = await this.downscaleJpeg(obj.getContents(), maxDim, quality);
          if (!small) continue;
          const embedded = await doc.embedJpg(small);
          xobj.set(key, embedded.ref);
          count++;
        } catch {
          continue;
        }
      }
    }
    return count;
  }

  private async downscaleJpeg(bytes: Uint8Array, maxDim: number, quality: number): Promise<Uint8Array | null> {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
      if (!blob) return null;
      return new Uint8Array(await blob.arrayBuffer());
    } catch {
      return null;
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
