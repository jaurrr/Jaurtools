import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-pdf-to-markdown',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-markdown.component.html',
  styleUrl: './pdf-to-markdown.component.scss',
})
export class PdfToMarkdownComponent implements OnDestroy {
  readonly slug = 'pdf-to-markdown';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-text', 'compare-pdf', 'pdf-to-jpg'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly detectHeadings = signal(true);
  readonly detectLists = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly copied = signal(false);
  readonly markdown = signal('');

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

  readonly headingCount = computed(
    () => (this.markdown().match(/^#{1,3} /gm) ?? []).length
  );
  readonly hasMd = computed(() => this.markdown().length > 0);

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

  toggleHeadings(v: boolean): void {
    this.detectHeadings.set(v);
    if (this.pdfBytes) void this.convert();
  }
  toggleLists(v: boolean): void {
    this.detectLists.set(v);
    if (this.pdfBytes) void this.convert();
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.markdown.set('');
    this.copied.set(false);
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
    this.pdfBytes = new Uint8Array(await file.arrayBuffer());
    this.fileName.set(file.name);
    await this.convert();
  }

  async convert(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const text = await this.extractText(this.pdfBytes);
      this.markdown.set(this.toMarkdown(text));
      this.status.set(this.t('labels.statusDone'));
    } catch {
      this.error.set(this.t('labels.errRender'));
    } finally {
      this.busy.set(false);
    }
  }

  async copyMd(): Promise<void> {
    const md = this.markdown();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = md;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 2000);
  }

  downloadMd(): void {
    const md = this.markdown();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = this.baseName(this.fileName()) + '.md';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private toMarkdown(text: string): string {
    const out: string[] = [];
    const para: string[] = [];
    const flush = (): void => {
      if (para.length) {
        out.push(para.join(' ').replace(/\s+/g, ' ').trim());
        para.length = 0;
      }
    };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) {
        flush();
        out.push('');
        continue;
      }
      if (this.detectLists() && /^[•\-*–—]\s+/.test(line)) {
        flush();
        out.push('- ' + line.replace(/^[•\-*–—]\s+/, ''));
        continue;
      }
      if (this.detectLists() && /^\d{1,3}[.)]\s+/.test(line)) {
        flush();
        out.push(line.replace(/^(\d{1,3})[.)]\s+/, '$1. '));
        continue;
      }
      if (this.detectHeadings()) {
        const level = this.headingLevel(line);
        if (level) {
          flush();
          out.push('#'.repeat(level) + ' ' + line.replace(/:$/, '').trim());
          continue;
        }
      }
      para.push(line);
    }
    flush();
    return out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private headingLevel(line: string): number {
    const t = line.replace(/:$/, '').trim();
    if (!t || t.length > 90) return 0;
    if (/^\d+(\.\d+){1,3}\s+\S/.test(t)) return 2;
    if (/^\d{1,3}\s+[A-Z\u00C0-\u024F]/.test(t) && t.length <= 60) return 2;
    const letters = t.replace(/[^A-Za-zÀ-ɏЀ-ӿ؀-ۿऀ-ॿ]/g, '');
    if (
      letters.length >= 4 &&
      letters === letters.toUpperCase() &&
      /[A-Za-zÀ-ɏ]/.test(letters)
    ) {
      return 2;
    }
    if (/:$/.test(line) && t.length <= 60) return 3;
    return 0;
  }

  private async extractText(bytes: Uint8Array): Promise<string> {
    const lib = await this.loadPdfJs();
    const doc = await lib.getDocument({ data: bytes.slice() }).promise;
    const n: number = doc.numPages;
    let out = '';
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const lines: string[] = [];
      let line = '';
      for (const item of tc.items as { str: string; hasEOL?: boolean }[]) {
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line.trim()) lines.push(line);
      out += lines.join('\n').trim() + '\n\n';
      if (typeof page.cleanup === 'function') page.cleanup();
    }
    if (typeof doc.destroy === 'function') {
      try {
        await doc.destroy();
      } catch {
        /* best effort */
      }
    }
    return out.replace(/[ \t]+\n/g, '\n').trim();
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private baseName(name: string): string {
    const dot = name.lastIndexOf('.');
    const b = dot > 0 ? name.slice(0, dot) : name;
    return b.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'pdf';
  }

  private async loadPdfJs(): Promise<any> {
    const lib = (await import('pdfjs-dist')) as unknown as {
      getDocument: (src: unknown) => { promise: Promise<any> };
      GlobalWorkerOptions: { workerSrc: string };
    };
    lib.GlobalWorkerOptions.workerSrc = 'assets/pdf-worker/pdf.worker.min.js';
    return lib;
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
