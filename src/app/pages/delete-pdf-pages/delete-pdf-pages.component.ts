import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-delete-pdf-pages',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './delete-pdf-pages.component.html',
  styleUrl: './delete-pdf-pages.component.scss',
})
export class DeletePdfPagesComponent implements OnDestroy {
  readonly slug = 'delete-pdf-pages';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['organize-pdf-pages', 'merge-pdf', 'crop-pdf', 'pdf-to-text'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly selected = signal<Set<number>>(new Set());
  readonly rangeText = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly remaining = signal(0);

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

  readonly pageList = computed(() => {
    const n = this.pageCount();
    return Array.from({ length: n }, (_, i) => i);
  });

  readonly selectedCount = computed(() => this.selected().size);

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

  setRange(v: string) { this.rangeText.set(v.slice(0, 200)); }

  isSelected(i: number): boolean { return this.selected().has(i); }

  togglePage(i: number) {
    const next = new Set(this.selected());
    if (next.has(i)) next.delete(i);
    else next.add(i);
    this.selected.set(next);
  }

  selectAll() {
    this.selected.set(new Set(this.pageList()));
  }

  clearSelection() {
    this.selected.set(new Set());
  }

  applyRange() {
    const parsed = this.parseRange(this.rangeText(), this.pageCount());
    if (parsed === null) { this.error.set(this.t('labels.errBadRange')); return; }
    this.error.set('');
    this.selected.set(parsed);
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
      this.pageCount.set(doc.getPageCount());
      this.selected.set(new Set());
      this.rangeText.set('');
    } catch {
      this.error.set(this.t('labels.errProcess'));
      this.pdfBytes = null;
      input.value = '';
    }
  }

  async deletePages() {
    if (!this.pdfBytes) { this.error.set(this.t('labels.errNoFile')); return; }
    if (this.selected().size === 0) { this.error.set(this.t('labels.errNoSelection')); return; }
    if (this.selected().size >= this.pageCount()) {
      this.error.set(this.t('labels.errDeleteAll')); return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes);
      const doomed = [...this.selected()].sort((a, b) => b - a);
      for (const i of doomed) doc.removePage(i);
      this.remaining.set(doc.getPageCount());
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
    this.saveBlob(this.outBytes, `${base}-trimmed.pdf`, 'application/pdf');
  }

  reset() {
    this.pdfBytes = null;
    this.outBytes = null;
    this.fileName.set('');
    this.pageCount.set(0);
    this.selected.set(new Set());
    this.rangeText.set('');
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

  private parseRange(text: string, total: number): Set<number> | null {
    const out = new Set<number>();
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    for (const part of parts) {
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) return null;
      let a = parseInt(m[1], 10);
      let b = m[2] ? parseInt(m[2], 10) : a;
      if (a < 1 || b < 1 || a > total || b > total) return null;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) out.add(i - 1);
    }
    return out;
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
