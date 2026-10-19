import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_LINES = 1200;

interface DiffRow {
  type: 'same' | 'del' | 'add';
  a: string;
  b: string;
}

@Component({
  selector: 'app-compare-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './compare-pdf.component.html',
  styleUrl: './compare-pdf.component.scss',
})
export class ComparePdfComponent implements OnDestroy {
  readonly slug = 'compare-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-text', 'pdf-to-markdown', 'redact-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly nameA = signal('');
  readonly nameB = signal('');
  readonly ignoreWs = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly rows = signal<DiffRow[]>([]);

  private bytesA: Uint8Array | null = null;
  private bytesB: Uint8Array | null = null;
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

  readonly added = computed(() => this.rows().filter((r) => r.type === 'add').length);
  readonly removed = computed(() => this.rows().filter((r) => r.type === 'del').length);
  readonly unchanged = computed(() => this.rows().filter((r) => r.type === 'same').length);
  readonly hasDiff = computed(() => this.rows().length > 0);

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

  toggleWs(v: boolean): void {
    this.ignoreWs.set(v);
  }

  async onFileSelected(ev: Event, which: 'a' | 'b'): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.rows.set([]);
    if (!this.isPdf(file)) {
      this.error.set(this.t('labels.errType').replace('{n}', file.name));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize').replace('{n}', file.name));
      input.value = '';
      return;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    if (which === 'a') {
      this.bytesA = data;
      this.nameA.set(file.name);
    } else {
      this.bytesB = data;
      this.nameB.set(file.name);
    }
  }

  async compare(): Promise<void> {
    if (!this.bytesA || !this.bytesB || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const textA = await this.extractText(this.bytesA);
      const textB = await this.extractText(this.bytesB);
      const norm = (s: string): string =>
        this.ignoreWs() ? s.replace(/\s+/g, ' ').trim() : s;
      const aLines = textA.split('\n').map(norm).slice(0, MAX_LINES);
      const bLines = textB.split('\n').map(norm).slice(0, MAX_LINES);
      const rows = this.diffLines(aLines, bLines);
      this.rows.set(rows);
      this.status.set(
        this.t('labels.statusDone')
          .replace('{a}', String(aLines.length))
          .replace('{b}', String(bLines.length))
      );
    } catch {
      this.error.set(this.t('labels.errRender'));
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
      out += lines.join('\n').trim() + '\n';
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

  private diffLines(a: string[], b: string[]): DiffRow[] {
    const n = a.length;
    const m = b.length;
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      const row = dp[i];
      const next = dp[i + 1];
      for (let j = m - 1; j >= 0; j--) {
        row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
      }
    }
    const rows: DiffRow[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        rows.push({ type: 'same', a: a[i], b: b[j] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        rows.push({ type: 'del', a: a[i], b: '' });
        i++;
      } else {
        rows.push({ type: 'add', a: '', b: b[j] });
        j++;
      }
    }
    while (i < n) {
      rows.push({ type: 'del', a: a[i], b: '' });
      i++;
    }
    while (j < m) {
      rows.push({ type: 'add', a: '', b: b[j] });
      j++;
    }
    return rows;
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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
