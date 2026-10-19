import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  attachToolSeo,
  baseName,
  downloadBytes,
  fmtBytes,
  loadPdfJs,
  readPdfInput,
  type PdfJsPage,
} from '../../utils/pdf-toolkit';

@Component({
  selector: 'app-pdf-to-html',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-html.component.html',
  styleUrl: './pdf-to-html.component.scss',
})
export class PdfToHtmlComponent implements OnDestroy {
  readonly slug = 'pdf-to-html';
  readonly lastReviewed = '2026-10-19';
  readonly relatedSlugs = ['pdf-to-text', 'pdf-to-markdown', 'pdf-to-png'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly detachSeo = attachToolSeo(this, this.pageTitle, this.meta, this.document);

  readonly fileName = signal('');
  readonly fileSize = signal(0);
  readonly pageCount = signal(0);
  readonly wordCount = signal(0);
  readonly charCount = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly donePages = signal(0);
  readonly preview = signal('');

  readonly progress = computed(() =>
    this.pageCount() > 0 ? Math.round((this.donePages() / this.pageCount()) * 100) : 0,
  );
  readonly outName = computed(() => `${baseName(this.fileName())}.html`);

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
  fmt(n: number): string {
    return fmtBytes(n);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const res = await readPdfInput(input);
    this.error.set('');
    this.status.set('');
    this.resetResult();
    if (!res.ok) {
      this.error.set(this.t(res.code === 'size' ? 'labels.errSize' : 'labels.errType'));
      input.value = '';
      return;
    }
    this.pdfBytes = res.bytes;
    this.fileName.set(res.name);
    this.fileSize.set(res.bytes.length);
  }

  async extract(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.resetResult();
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: this.pdfBytes.slice() }).promise;
      const n: number = doc.numPages;
      this.pageCount.set(n);
      const sections: string[] = [];
      let words = 0;
      let chars = 0;
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const body = this.pageToHtml(await this.pageText(page), i);
        sections.push(body);
        const textOnly = body.replace(/<[^>]+>/g, ' ');
        words += textOnly.trim().split(/\s+/).filter(Boolean).length;
        chars += textOnly.length;
        this.donePages.set(i);
        if (typeof page.cleanup === 'function') page.cleanup();
      }
      if (typeof doc.destroy === 'function') {
        try {
          await doc.destroy();
        } catch {
          /* best effort */
        }
      }
      const lang = this.translate.lang();
      this.htmlDoc = this.wrapDocument(sections.join('\n'), lang, this.fileName());
      this.wordCount.set(words);
      this.charCount.set(chars);
      const plain = this.htmlDoc
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      this.preview.set(plain.slice(0, 3000));
      this.status.set(this.t('labels.statusDone').replace('{n}', String(n)));
    } catch {
      this.error.set(this.t('labels.errExtract'));
    } finally {
      this.busy.set(false);
    }
  }

  download(): void {
    if (!this.htmlDoc) return;
    const bytes = new TextEncoder().encode(this.htmlDoc);
    downloadBytes(this.document, bytes, this.outName(), 'text/html');
  }

  ngOnDestroy(): void {
    this.detachSeo();
  }

  private pdfBytes: Uint8Array | null = null;
  private htmlDoc = '';

  private resetResult(): void {
    this.htmlDoc = '';
    this.pageCount.set(0);
    this.wordCount.set(0);
    this.charCount.set(0);
    this.donePages.set(0);
    this.preview.set('');
  }

  private async pageText(page: PdfJsPage): Promise<string[][]> {
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const list = rows.get(y) ?? [];
      list.push({ x, str: it.str });
      rows.set(y, list);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    return ys.map((y) =>
      (rows.get(y) ?? []).sort((a, b) => a.x - b.x).map((r) => r.str),
    );
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private pageToHtml(lines: string[][], pageNo: number): string {
    const paras: string[] = [];
    let buf: string[] = [];
    const flush = () => {
      if (buf.length) {
        paras.push(`<p>${this.esc(buf.join(' '))}</p>`);
        buf = [];
      }
    };
    for (const words of lines) {
      const line = words.join('').trim();
      if (!line) {
        flush();
        continue;
      }
      buf.push(line);
      if (/[.!?…:;]$/.test(line)) flush();
    }
    flush();
    const heading = `<h2 class="page-no">${this.esc(this.t('labels.pageLabel'))} ${pageNo}</h2>`;
    return `<section class="pdf-page" data-page="${pageNo}">\n${heading}\n${paras.join('\n')}\n</section>`;
  }

  private wrapDocument(body: string, lang: string, title: string): string {
    return [
      '<!DOCTYPE html>',
      `<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`,
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${this.esc(title)}</title>`,
      '<style>',
      'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.7;max-width:62rem;margin:0 auto;padding:2rem 1rem;color:#111}',
      '.pdf-page{margin-bottom:2.5rem;border-bottom:1px solid #ddd;padding-bottom:1.5rem}',
      '.page-no{font-size:.85rem;color:#666;text-transform:uppercase;letter-spacing:.06em}',
      'p{margin:0 0 1em}',
      '</style>',
      '</head>',
      '<body>',
      `<h1>${this.esc(title)}</h1>`,
      body,
      '</body>',
      '</html>',
    ].join('\n');
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
}
