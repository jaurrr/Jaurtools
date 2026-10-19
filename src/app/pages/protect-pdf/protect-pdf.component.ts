import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CantooPDFDocument {
  encrypt(opts: Record<string, unknown>): void;
  save(opts?: Record<string, unknown>): Promise<Uint8Array>;
}

@Component({
  selector: 'app-protect-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './protect-pdf.component.html',
  styleUrl: './protect-pdf.component.scss',
})
export class ProtectPdfComponent implements OnDestroy {
  readonly slug = 'protect-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-pdf', 'compress-pdf', 'edit-pdf', 'delete-pdf-pages'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly userPw = signal('');
  readonly ownerPw = signal('');
  readonly allowPrint = signal(true);
  readonly allowCopy = signal(false);
  readonly busy = signal(false);
  readonly loadingLib = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly verified = signal(false);

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;
  private cantoo: {
    PDFDocument: { load(bytes: Uint8Array, opts?: Record<string, unknown>): Promise<CantooPDFDocument> };
  } | null = null;

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

  setUserPw(v: string) { this.userPw.set(v.slice(0, 128)); }
  setOwnerPw(v: string) { this.ownerPw.set(v.slice(0, 128)); }
  togglePrint() { this.allowPrint.set(!this.allowPrint()); }
  toggleCopy() { this.allowCopy.set(!this.allowCopy()); }

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

  async protect() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.userPw().length < 4) { this.error.set(this.t('labels.errShortPw')); return; }
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    this.verified.set(false);
    try {
      const mod = await this.loadCantoo();
      const doc = await mod.PDFDocument.load(this.pdfBytes.slice());
      const owner = this.ownerPw() || this.userPw();
      const permissions = {
        printing: this.allowPrint() ? 'highResolution' : 'none',
        modifying: false,
        copying: this.allowCopy(),
        annotating: false,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: false,
      };
      try {
        doc.encrypt({ userPassword: this.userPw(), ownerPassword: owner, permissions });
      } catch {
        doc.encrypt({ userPassword: this.userPw(), ownerPassword: owner });
      }
      const out = await doc.save({ useObjectStreams: true });
      this.outBytes = out;
      this.verified.set(await this.verify(out));
      this.done.set(true);
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
      this.loadingLib.set(false);
    }
  }

  download() {
    if (!this.outBytes) return;
    const base = this.fileName().replace(/\.pdf$/i, '');
    this.saveBlob(this.outBytes, `${base}-protected.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.userPw.set('');
    this.ownerPw.set('');
    this.done.set(false);
    this.error.set('');
    this.verified.set(false);
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

  private async loadCantoo() {
    if (this.cantoo) return this.cantoo;
    this.loadingLib.set(true);
    try {
      const mod = (await import('@cantoo/pdf-lib')) as unknown as {
        PDFDocument: { load(bytes: Uint8Array, opts?: Record<string, unknown>): Promise<CantooPDFDocument> };
      };
      this.cantoo = mod;
      return mod;
    } finally {
      this.loadingLib.set(false);
    }
  }

  private async verify(bytes: Uint8Array): Promise<boolean> {
    try {
      if (!this.cantoo) return false;
      await this.cantoo.PDFDocument.load(bytes.slice(), { password: this.userPw() });
      return true;
    } catch {
      return false;
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
