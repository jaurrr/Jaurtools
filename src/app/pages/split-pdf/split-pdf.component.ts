import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

type SplitMode = 'all' | 'ranges' | 'extract';

interface SplitOutput {
  name: string;
  url: string;
  bytes: Uint8Array;
}

@Component({
  selector: 'app-split-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './split-pdf.component.html',
  styleUrl: './split-pdf.component.scss',
})
export class SplitPdfComponent implements OnDestroy {
  readonly slug = 'split-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rotate-pdf', 'pdf-to-zip', 'pdf-to-jpg'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly splitMode = signal<SplitMode>('all');
  readonly ranges = signal('');
  readonly fileName = signal('');
  readonly pageCount = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outputs = signal<SplitOutput[]>([]);

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

  readonly hasFile = computed(() => this.fileName().length > 0);

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

  setSplitMode(m: SplitMode): void {
    this.splitMode.set(m);
    this.error.set('');
  }
  setRanges(v: string): void {
    this.ranges.set(v);
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    this.clearOutputs();
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
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(data, { ignoreEncryption: true });
      this.pdfBytes = data;
      this.fileName.set(file.name);
      this.pageCount.set(doc.getPageCount());
      this.status.set(
        this.t('labels.statusLoaded').replace('{n}', String(doc.getPageCount()))
      );
    } catch {
      this.error.set(this.t('labels.errParse'));
      this.pdfBytes = null;
      this.fileName.set('');
      this.pageCount.set(0);
    }
  }

  async split(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    const total = this.pageCount();
    const mode = this.splitMode();
    let groups: number[][] = [];
    if (mode === 'all') {
      groups = Array.from({ length: total }, (_, i) => [i]);
    } else {
      groups = this.parseGroups(this.ranges(), total);
      if (!groups.length) {
        this.error.set(this.t('labels.errRanges'));
        return;
      }
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.clearOutputs();
    try {
      const src = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      const base = this.baseName(this.fileName());
      const out: SplitOutput[] = [];
      for (let g = 0; g < groups.length; g++) {
        const sub = await PDFDocument.create();
        const copied = await sub.copyPages(src, groups[g]);
        for (const p of copied) sub.addPage(p);
        const bytes = await sub.save({ useObjectStreams: true });
        const first = groups[g][0] + 1;
        const last = groups[g][groups[g].length - 1] + 1;
        const label = first === last ? `page-${first}` : `pages-${first}-${last}`;
        const name = `${base}-${label}.pdf`;
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        out.push({
          name,
          url: URL.createObjectURL(new Blob([ab], { type: 'application/pdf' })),
          bytes,
        });
      }
      this.outputs.set(out);
      if (out.length === 1) {
        this.triggerDownload(out[0]);
      } else {
        const zip = this.buildZip(out.map((o) => ({ name: o.name, data: o.bytes })));
        this.downloadBytes(zip, `${base}-split.zip`, 'application/zip');
      }
      this.status.set(this.t('labels.statusDone').replace('{n}', String(out.length)));
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  downloadOne(o: SplitOutput): void {
    this.triggerDownload(o);
  }

  ngOnDestroy(): void {
    this.clearOutputs();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clearOutputs(): void {
    for (const o of this.outputs()) URL.revokeObjectURL(o.url);
    this.outputs.set([]);
  }

  private triggerDownload(o: SplitOutput): void {
    const a = this.document.createElement('a');
    a.href = o.url;
    a.download = o.name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
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

  private parseGroups(input: string, total: number): number[][] {
    const groups: number[][] = [];
    for (const part of input.split(',')) {
      const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) continue;
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const idxs: number[] = [];
      for (let p = lo; p <= hi; p++) {
        if (p >= 1 && p <= total) idxs.push(p - 1);
      }
      if (idxs.length) groups.push(idxs);
    }
    return groups;
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private baseName(name: string): string {
    const dot = name.lastIndexOf('.');
    const b = dot > 0 ? name.slice(0, dot) : name;
    return b.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'pdf';
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
