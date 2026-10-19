import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface MergeFile {
  id: number;
  name: string;
  bytes: Uint8Array;
  pages: number;
}

@Component({
  selector: 'app-merge-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './merge-pdf.component.html',
  styleUrl: './merge-pdf.component.scss',
})
export class MergePdfComponent implements OnDestroy {
  readonly slug = 'merge-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['organize-pdf-pages', 'compress-pdf', 'delete-pdf-pages', 'jpg-to-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly files = signal<MergeFile[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly totalPages = signal(0);
  readonly fileDragging = signal(false);

  private outBytes: Uint8Array | null = null;
  private nextId = 1;
  private dragId: number | null = null;

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

  async onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.error.set('');
    await this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOverFiles(ev: DragEvent): void {
    ev.preventDefault();
    this.fileDragging.set(true);
  }

  async onDropFiles(ev: DragEvent) {
    ev.preventDefault();
    this.fileDragging.set(false);
    this.error.set('');
    const dropped = Array.from(ev.dataTransfer?.files ?? []);
    await this.addFiles(dropped);
  }

  private async addFiles(chosen: File[]) {
    for (const file of chosen) {
      if (!this.validPdf(file)) continue;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(buf);
        this.files.set([...this.files(), {
          id: this.nextId++, name: file.name, bytes: buf, pages: doc.getPageCount(),
        }]);
      } catch {
        this.error.set(this.t('labels.errProcess'));
      }
    }
  }

  pageNums(f: MergeFile): number[] {
    const n = Math.min(f.pages, 24);
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  extraPages(f: MergeFile): number {
    return Math.max(0, f.pages - 24);
  }

  move(id: number, dir: -1 | 1) {
    const arr = [...this.files()];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.files.set(arr);
  }

  remove(id: number) {
    this.files.set(this.files().filter((f) => f.id !== id));
  }

  fmtBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return `${r} ${units[i]}`;
  }

  dragStart(id: number) { this.dragId = id; }
  dragOver(ev: DragEvent) { ev.preventDefault(); }
  dropOn(targetId: number) {
    if (this.dragId === null || this.dragId === targetId) { this.dragId = null; return; }
    const arr = [...this.files()];
    const from = arr.findIndex((x) => x.id === this.dragId);
    const to = arr.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) { this.dragId = null; return; }
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    this.files.set(arr);
    this.dragId = null;
  }

  async merge() {
    if (this.files().length < 2) { this.error.set(this.t('labels.errNeedTwo')); return; }
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    try {
      const out = await PDFDocument.create();
      let total = 0;
      for (const f of this.files()) {
        const src = await PDFDocument.load(f.bytes.slice());
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        total += pages.length;
      }
      this.totalPages.set(total);
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
    this.saveBlob(this.outBytes, 'merged.pdf', 'application/pdf');
  }

  reset() {
    this.outBytes = null;
    this.files.set([]);
    this.done.set(false);
    this.error.set('');
    this.totalPages.set(0);
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
