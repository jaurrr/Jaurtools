import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from '@cantoo/pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-unlock-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './unlock-pdf.component.html',
  styleUrl: './unlock-pdf.component.scss',
})
export class UnlockPdfComponent implements OnDestroy {
  readonly slug = 'unlock-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fill-pdf-form', 'rotate-pdf', 'watermark-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly password = signal('');
  readonly locked = signal<boolean | null>(null);
  readonly pageCount = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');

  private pdfBytes: Uint8Array | null = null;
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

  setPassword(v: string): void {
    this.password.set(v);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.password.set('');
    this.locked.set(null);
    this.pageCount.set(0);
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
    const data = new Uint8Array(await file.arrayBuffer());
    this.pdfBytes = data;
    this.fileName.set(file.name);
    try {
      const doc = await PDFDocument.load(data);
      this.locked.set(false);
      this.pageCount.set(doc.getPageCount());
    } catch (e) {
      if (this.isPasswordError(e)) {
        this.locked.set(true);
      } else {
        this.error.set(this.t('labels.errParse'));
        this.pdfBytes = null;
        this.fileName.set('');
      }
    }
  }

  async unlock(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    if (!this.password()) {
      this.error.set(this.t('labels.errNoPassword'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes, { password: this.password() });
      const fresh = await PDFDocument.create();
      const pages = await fresh.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => fresh.addPage(p));
      const bytes = await fresh.save({ useObjectStreams: true });
      this.downloadBytes(bytes, this.suffixed(this.fileName(), '-unlocked'), 'application/pdf');
      this.status.set(this.t('labels.statusDone'));
    } catch (e) {
      if (this.isPasswordError(e)) this.error.set(this.t('labels.errPassword'));
      else this.error.set(this.t('labels.errProcess'));
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

  private isPasswordError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return /password|decrypt|encrypt/i.test(msg);
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
