import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

interface ZipItem {
  name: string;
  size: number;
  data: Uint8Array;
}

@Component({
  selector: 'app-pdf-to-zip',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pdf-to-zip.component.html',
  styleUrl: './pdf-to-zip.component.scss',
})
export class PdfToZipComponent implements OnDestroy {
  readonly slug = 'pdf-to-zip';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['split-pdf', 'pdf-to-jpg', 'rotate-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly items = signal<ZipItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly zipName = signal('pdf-bundle');

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

  readonly totalSize = computed(() => this.items().reduce((s, f) => s + f.size, 0));
  readonly hasItems = computed(() => this.items().length > 0);

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

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  setZipName(v: string): void {
    this.zipName.set(v);
  }

  async onFilesSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    this.error.set('');
    this.status.set('');
    const next = this.items().slice();
    for (const file of files) {
      if (!this.isPdf(file)) {
        this.error.set(this.t('labels.errType').replace('{n}', file.name));
        continue;
      }
      if (file.size > MAX_BYTES) {
        this.error.set(this.t('labels.errSize').replace('{n}', file.name));
        continue;
      }
      next.push({
        name: this.uniqueName(file.name, next.map((x) => x.name)),
        size: file.size,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }
    this.items.set(next);
    input.value = '';
  }

  removeItem(i: number): void {
    const next = this.items().slice();
    next.splice(i, 1);
    this.items.set(next);
    this.status.set('');
  }

  clearAll(): void {
    this.items.set([]);
    this.status.set('');
    this.error.set('');
  }

  createZip(): void {
    const list = this.items();
    if (!list.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const zip = this.buildZip(list.map((f) => ({ name: f.name, data: f.data })));
      const raw = this.zipName().trim() || 'pdf-bundle';
      const name = raw.replace(/[^\w\-. ]+/g, '-').replace(/\.zip$/i, '') + '.zip';
      this.downloadBytes(zip, name, 'application/zip');
      this.status.set(
        this.t('labels.statusDone')
          .replace('{n}', String(list.length))
          .replace('{s}', this.formatSize(zip.length))
      );
    } catch {
      this.error.set(this.t('labels.errProcess'));
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

  private uniqueName(name: string, taken: string[]): string {
    if (!taken.includes(name)) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let k = 2;
    while (taken.includes(`${stem} (${k})${ext}`)) k++;
    return `${stem} (${k})${ext}`;
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

  private crcTable: Uint32Array | null = null;
  private crc32(data: Uint8Array): number {
    if (!this.crcTable) {
      const tbl = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tbl[n] = c >>> 0;
      }
      this.crcTable = tbl;
    }
    const tbl = this.crcTable;
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = tbl[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  private concatParts(parts: Uint8Array[]): Uint8Array {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  private buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const u32 = (n: number): Uint8Array => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, n >>> 0, true);
      return b;
    };
    const u16 = (n: number): Uint8Array => {
      const b = new Uint8Array(2);
      new DataView(b.buffer).setUint16(0, n, true);
      return b;
    };
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name);
      const crc = this.crc32(f.data);
      const lh = this.concatParts([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(nameB.length), u16(0), nameB, f.data,
      ]);
      local.push(lh);
      central.push(
        this.concatParts([
          u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0),
          u16(0), u32(crc), u32(f.data.length), u32(f.data.length),
          u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0),
          u32(offset), nameB,
        ])
      );
      offset += lh.length;
    }
    const cd = this.concatParts(central);
    const end = this.concatParts([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0),
    ]);
    return this.concatParts([...local, cd, end]);
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
