import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ExtractEntry {
  name: string;
  compressed: number;
  uncompressed: number;
  method: number;
  encrypted: boolean;
  isDir: boolean;
  localOffset: number;
  selected: boolean;
  status: 'idle' | 'working' | 'done' | 'skipped' | 'failed';
}

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_UNCOMPRESSED = 500 * 1024 * 1024;

@Component({
  selector: 'app-unzip-files-online',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './unzip-files-online.component.html',
  styleUrl: './unzip-files-online.component.scss',
})
export class UnzipFilesOnlineComponent implements OnDestroy {
  readonly slug = 'unzip-files-online';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['zip-archive-content-viewer', 'zip-code-format-validator', 'xml-inspector'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly entries = signal<ExtractEntry[]>([]);
  readonly errorKey = signal('');
  readonly loading = signal(false);
  readonly extracting = signal(false);
  private buffer: ArrayBuffer | null = null;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly files = computed(() => this.entries().filter((e) => !e.isDir));
  readonly selectedFiles = computed(() => this.files().filter((e) => e.selected && this.extractable(e)));
  readonly allSelected = computed(() => {
    const f = this.files().filter((e) => this.extractable(e));
    return f.length > 0 && f.every((e) => e.selected);
  });
  readonly canDecompress = typeof DecompressionStream !== 'undefined';

  readonly whole = computed(() => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }));
  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  extractable(e: ExtractEntry): boolean {
    if (e.encrypted) return false;
    if (e.method === 0) return true;
    return e.method === 8 && this.canDecompress;
  }

  skipReason(e: ExtractEntry): string {
    if (e.encrypted) return this.t('labels.skipEncrypted');
    if (e.method !== 0 && e.method !== 8) return this.t('labels.skipMethod');
    if (e.method === 8 && !this.canDecompress) return this.t('labels.skipBrowser');
    return '';
  }

  formatBytes(n: number): string {
    if (n < 1024) return this.whole().format(n) + ' ' + this.t('labels.byteUnit');
    if (n < 1048576) return this.oneDecimal().format(n / 1024) + ' ' + this.t('labels.kbUnit');
    return this.oneDecimal().format(n / 1048576) + ' ' + this.t('labels.mbUnit');
  }

  async onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.reset();
    this.fileName.set(file.name);
    if (file.size > MAX_BYTES) {
      this.errorKey.set('errorTooBig');
      return;
    }
    this.loading.set(true);
    try {
      this.buffer = await file.arrayBuffer();
      const entries = this.parseZip(this.buffer);
      if (!entries) {
        this.errorKey.set('errorParse');
        this.buffer = null;
        return;
      }
      const total = entries.reduce((s, x) => s + x.uncompressed, 0);
      if (total > MAX_UNCOMPRESSED) {
        this.errorKey.set('errorBomb');
        this.buffer = null;
        return;
      }
      this.entries.set(entries);
    } catch {
      this.errorKey.set('errorParse');
      this.buffer = null;
    } finally {
      this.loading.set(false);
    }
  }

  private reset() {
    this.errorKey.set('');
    this.entries.set([]);
    this.fileName.set('');
    this.buffer = null;
  }

  toggleSelect(index: number) {
    this.entries.update((list) =>
      list.map((e, i) => (i === index ? { ...e, selected: !e.selected } : e))
    );
  }

  toggleSelectAll() {
    const target = !this.allSelected();
    this.entries.update((list) =>
      list.map((e) => (e.isDir || !this.extractable(e) ? e : { ...e, selected: target }))
    );
  }

  setStatus(index: number, status: ExtractEntry['status']) {
    this.entries.update((list) => list.map((e, i) => (i === index ? { ...e, status } : e)));
  }

  async extractOne(index: number) {
    const entry = this.entries()[index];
    if (!entry || !this.extractable(entry) || !this.buffer) return;
    this.setStatus(index, 'working');
    try {
      const blob = await this.extractBlob(entry, this.buffer);
      this.saveBlob(blob, entry.name);
      this.setStatus(index, 'done');
    } catch {
      this.setStatus(index, 'failed');
    }
  }

  async extractSelected() {
    if (this.extracting() || !this.buffer) return;
    this.extracting.set(true);
    const list = this.entries();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isDir || !e.selected || !this.extractable(e)) continue;
      await this.extractOne(i);
      await new Promise((r) => setTimeout(r, 150));
    }
    this.extracting.set(false);
  }

  private async extractBlob(entry: ExtractEntry, buffer: ArrayBuffer): Promise<Blob> {
    const view = new DataView(buffer);
    const off = entry.localOffset;
    if (view.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header');
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const dataStart = off + 30 + nameLen + extraLen;
    const data = new Uint8Array(buffer, dataStart, entry.compressed);
    if (entry.method === 0) return new Blob([data]);
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    await writer.write(data);
    await writer.close();
    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return new Blob(chunks as BlobPart[]);
  }

  private saveBlob(blob: Blob, name: string) {
    const fileName = name.split('/').pop() || 'file';
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = fileName;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private parseZip(buffer: ArrayBuffer): ExtractEntry[] | null {
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
      if (count === 0xffff || cdOffset === 0xffffffff) return null;
      const decoder = new TextDecoder('utf-8');
      const entries: ExtractEntry[] = [];
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
        const localOffset = view.getUint32(off + 42, true);
        const nameBytes = new Uint8Array(buffer, off + 46, nameLen);
        let name: string;
        try { name = decoder.decode(nameBytes); }
        catch { name = Array.from(nameBytes).map((b) => String.fromCharCode(b)).join(''); }
        entries.push({
          name, compressed: comp, uncompressed: uncomp, method,
          encrypted: (flags & 1) !== 0, isDir: name.endsWith('/'),
          localOffset, selected: false, status: 'idle',
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
    this.buffer = null;
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
