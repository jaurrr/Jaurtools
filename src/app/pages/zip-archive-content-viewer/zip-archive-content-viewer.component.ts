import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ZipEntry {
  name: string;
  compressed: number;
  uncompressed: number;
  method: number;
  encrypted: boolean;
  isDir: boolean;
}

const MAX_BYTES = 200 * 1024 * 1024;

@Component({
  selector: 'app-zip-archive-content-viewer',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './zip-archive-content-viewer.component.html',
  styleUrl: './zip-archive-content-viewer.component.scss',
})
export class ZipArchiveContentViewerComponent implements OnDestroy {
  readonly slug = 'zip-archive-content-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['unzip-files-online', 'zip-code-format-validator', 'xml-inspector'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly entries = signal<ZipEntry[]>([]);
  readonly errorKey = signal('');
  readonly loading = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly fileCount = computed(() => this.entries().filter((e) => !e.isDir).length);
  readonly dirCount = computed(() => this.entries().filter((e) => e.isDir).length);
  readonly totalUncompressed = computed(() => this.entries().reduce((s, e) => s + e.uncompressed, 0));
  readonly totalCompressed = computed(() => this.entries().reduce((s, e) => s + e.compressed, 0));
  readonly overallRatio = computed(() => {
    const u = this.totalUncompressed();
    return u > 0 ? (1 - this.totalCompressed() / u) * 100 : 0;
  });

  readonly whole = computed(() => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }));
  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  formatBytes(n: number): string {
    if (n < 1024) return this.whole().format(n) + ' ' + this.t('labels.byteUnit');
    if (n < 1048576) return this.oneDecimal().format(n / 1024) + ' ' + this.t('labels.kbUnit');
    return this.oneDecimal().format(n / 1048576) + ' ' + this.t('labels.mbUnit');
  }

  ratioOf(e: ZipEntry): string {
    if (e.isDir || e.uncompressed === 0) return '—';
    return this.whole().format(Math.round((1 - e.compressed / e.uncompressed) * 100)) + '%';
  }

  methodOf(e: ZipEntry): string {
    if (e.method === 0) return this.t('labels.methodStored');
    if (e.method === 8) return this.t('labels.methodDeflated');
    return this.t('labels.methodOther') + ' (' + e.method + ')';
  }

  async onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.errorKey.set('');
    this.entries.set([]);
    this.fileName.set(file.name);
    if (file.size > MAX_BYTES) {
      this.errorKey.set('errorTooBig');
      return;
    }
    this.loading.set(true);
    try {
      const buffer = await file.arrayBuffer();
      const entries = this.parseZip(buffer);
      if (!entries) {
        this.errorKey.set('errorParse');
        return;
      }
      this.entries.set(entries);
    } catch {
      this.errorKey.set('errorParse');
    } finally {
      this.loading.set(false);
    }
  }

  private parseZip(buffer: ArrayBuffer): ZipEntry[] | null {
    try {
      const view = new DataView(buffer);
      const len = buffer.byteLength;
      if (len < 22) return null;
      let eocd = -1;
      const scanStart = Math.max(0, len - 22 - 65557);
      for (let i = len - 22; i >= scanStart; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) return null;
      const count = view.getUint16(eocd + 10, true);
      const cdOffset = view.getUint32(eocd + 16, true);
      if (count === 0xffff || cdOffset === 0xffffffff) return null; // ZIP64 not supported
      const decoder = new TextDecoder('utf-8');
      const entries: ZipEntry[] = [];
      let off = cdOffset;
      for (let n = 0; n < count; n++) {
        if (off + 46 > len || view.getUint32(off, true) !== 0x02014b50) return null;
        const flags = view.getUint16(off + 8, true);
        const method = view.getUint16(off + 10, true);
        const comp = view.getUint32(off + 20, true);
        const uncomp = view.getUint32(off + 24, true);
        const nameLen = view.getUint16(off + 28, true);
        const extraLen = view.getUint16(off + 30, true);
        const commentLen = view.getUint16(off + 32, true);
        const nameBytes = new Uint8Array(buffer, off + 46, nameLen);
        let name: string;
        try { name = decoder.decode(nameBytes); }
        catch { name = Array.from(nameBytes).map((b) => String.fromCharCode(b)).join(''); }
        entries.push({
          name,
          compressed: comp,
          uncompressed: uncomp,
          method,
          encrypted: (flags & 1) !== 0,
          isDir: name.endsWith('/'),
        });
        off += 46 + nameLen + extraLen + commentLen;
      }
      return entries;
    } catch {
      return null;
    }
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

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
