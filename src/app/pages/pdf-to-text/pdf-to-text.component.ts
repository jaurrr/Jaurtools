import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-pdf-to-text',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-text.component.html',
  styleUrl: './pdf-to-text.component.scss',
})
export class PdfToTextComponent implements OnDestroy {
  readonly slug = 'pdf-to-text';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-markdown', 'compare-pdf', 'pdf-to-jpg'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly copied = signal(false);
  readonly withPageNums = signal(true);
  readonly text = signal('');

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

  readonly charCount = computed(() => this.text().length);
  readonly wordCount = computed(() => {
    const t = this.text().trim();
    return t ? t.split(/\s+/).length : 0;
  });
  readonly hasText = computed(() => this.text().length > 0);

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

  togglePageNums(v: boolean): void {
    this.withPageNums.set(v);
    if (this.pdfBytes && this.text()) void this.extractAll();
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.text.set('');
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
    await this.extractAll();
  }

  async extractAll(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const lib = await this.loadPdfJs();
      const doc = await lib.getDocument({ data: this.pdfBytes.slice() }).promise;
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
        const body = lines.join('\n').replace(/[ \t]+\n/g, '\n').trim();
        if (this.withPageNums()) out += `--- ${this.t('labels.pageAlt')} ${i} ---\n`;
        out += body + '\n\n';
        if (typeof page.cleanup === 'function') page.cleanup();
      }
      if (typeof doc.destroy === 'function') {
        try {
          await doc.destroy();
        } catch {
          /* best effort */
        }
      }
      this.text.set(out.trimEnd());
      this.status.set(this.t('labels.statusDone').replace('{n}', String(n)));
    } catch {
      this.error.set(this.t('labels.errRender'));
    } finally {
      this.busy.set(false);
    }
  }

  async copyText(): Promise<void> {
    const txt = this.text();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = txt;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 2000);
  }

  downloadTxt(): void {
    const txt = this.text();
    if (!txt) return;
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = this.baseName(this.fileName()) + '.txt';
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

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
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
