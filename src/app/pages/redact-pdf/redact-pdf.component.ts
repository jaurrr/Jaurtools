import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;
const RENDER_SCALE = 2;

interface TermHit {
  term: string;
  count: number;
}

@Component({
  selector: 'app-redact-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './redact-pdf.component.html',
  styleUrl: './redact-pdf.component.scss',
})
export class RedactPdfComponent implements OnDestroy {
  readonly slug = 'redact-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['watermark-pdf', 'pdf-to-text', 'sign-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly terms = signal('');
  readonly caseSensitive = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly hits = signal<TermHit[]>([]);
  readonly totalHits = signal(0);

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

  setTerms(v: string): void {
    this.terms.set(v);
  }
  toggleCase(v: boolean): void {
    this.caseSensitive.set(v);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.hits.set([]);
    this.totalHits.set(0);
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
  }

  async redact(): Promise<void> {
    const terms = this.terms()
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!this.pdfBytes || this.busy()) return;
    if (!terms.length) {
      this.error.set(this.t('labels.errNoTerms'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const lib = await this.loadPdfJs();
      const src = await lib.getDocument({ data: this.pdfBytes.slice() }).promise;
      const n: number = src.numPages;
      const out = await PDFDocument.create();
      const cs = this.caseSensitive();
      const counts = new Map<string, number>();
      let total = 0;

      for (let i = 1; i <= n; i++) {
        const page = await src.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = this.document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const tc = await page.getTextContent();
        const measure = this.document.createElement('canvas').getContext('2d');
        ctx.fillStyle = '#000000';
        for (const item of tc.items as {
          str: string;
          transform: number[];
        }[]) {
          const str = item.str;
          if (!str.trim()) continue;
          const hay = cs ? str : str.toLowerCase();
          for (const term of terms) {
            const needle = cs ? term : term.toLowerCase();
            let idx = hay.indexOf(needle);
            while (idx >= 0) {
              const tx = lib.Util.transform(viewport.transform, item.transform);
              const fontPx = Math.max(4, Math.hypot(tx[2], tx[3]));
              const x0 = tx[4];
              const yBase = tx[5];
              let beforeW = 0;
              let matchW = fontPx * term.length * 0.55;
              if (measure) {
                measure.font = `${fontPx}px sans-serif`;
                beforeW = measure.measureText(str.slice(0, idx)).width;
                matchW = measure.measureText(str.slice(idx, idx + term.length)).width;
              }
              const pad = fontPx * 0.4;
              ctx.fillRect(
                x0 + beforeW - pad,
                yBase - fontPx - pad * 0.6,
                matchW + pad * 2,
                fontPx * 1.55
              );
              total++;
              counts.set(term, (counts.get(term) ?? 0) + 1);
              idx = hay.indexOf(needle, idx + needle.length);
            }
          }
        }

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, 'image/jpeg', 0.92)
        );
        if (!blob) throw new Error('encode');
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const pg = out.addPage([viewport.width, viewport.height]);
        pg.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        if (typeof page.cleanup === 'function') page.cleanup();
      }
      if (typeof src.destroy === 'function') {
        try {
          await src.destroy();
        } catch {
          /* best effort */
        }
      }

      const bytes = await out.save({ useObjectStreams: true });
      this.downloadBytes(bytes, this.suffixed(this.fileName(), '-redacted'), 'application/pdf');
      this.hits.set(terms.map((term) => ({ term, count: counts.get(term) ?? 0 })));
      this.totalHits.set(total);
      this.status.set(this.t('labels.statusDone').replace('{n}', String(total)));
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
