import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface PageItem {
  id: number;
  origIndex: number;
}

@Component({
  selector: 'app-organize-pdf-pages',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './organize-pdf-pages.component.html',
  styleUrl: './organize-pdf-pages.component.scss',
})
export class OrganizePdfPagesComponent implements OnDestroy {
  readonly slug = 'organize-pdf-pages';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-pdf', 'delete-pdf-pages', 'crop-pdf', 'add-page-numbers-to-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly order = signal<PageItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  private pdfBytes: Uint8Array | null = null;
  private outBytes: Uint8Array | null = null;
  private dragId: number | null = null;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly orderPreview = computed(() =>
    this.order().map((p) => p.origIndex + 1).join(', '));

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
      const n = doc.getPageCount();
      this.order.set(Array.from({ length: n }, (_, i) => ({ id: i + 1, origIndex: i })));
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  move(id: number, dir: -1 | 1) {
    const arr = [...this.order()];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.order.set(arr);
  }

  dragStart(id: number) { this.dragId = id; }
  dragOver(ev: DragEvent) { ev.preventDefault(); }
  dropOn(targetId: number) {
    if (this.dragId === null || this.dragId === targetId) { this.dragId = null; return; }
    const arr = [...this.order()];
    const from = arr.findIndex((x) => x.id === this.dragId);
    const to = arr.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) { this.dragId = null; return; }
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    this.order.set(arr);
    this.dragId = null;
  }

  async apply() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.order().length === 0) { this.error.set(this.t('labels.errNoFile')); return; }
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    try {
      const src = await PDFDocument.load(this.pdfBytes.slice());
      const out = await PDFDocument.create();
      const indices = this.order().map((p) => p.origIndex);
      const pages = await out.copyPages(src, indices);
      pages.forEach((p) => out.addPage(p));
      this.outBytes = await out.save({ useObjectStreams: true });
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
    this.saveBlob(this.outBytes, `${base}-reordered.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.order.set([]);
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
