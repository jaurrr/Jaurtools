import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, degrees } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;

interface RotFile {
  name: string;
  data: Uint8Array;
  pages: number;
  range: string;
}

interface RotOutput {
  name: string;
  url: string;
  bytes: Uint8Array;
}

@Component({
  selector: 'app-rotate-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './rotate-pdf.component.html',
  styleUrl: './rotate-pdf.component.scss',
})
export class RotatePdfComponent implements OnDestroy {
  readonly slug = 'rotate-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['split-pdf', 'watermark-pdf', 'pdf-to-zip'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly files = signal<RotFile[]>([]);
  readonly angle = signal(90);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly outputs = signal<RotOutput[]>([]);

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

  readonly hasFiles = computed(() => this.files().length > 0);

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

  setAngle(v: number): void {
    this.angle.set(v);
  }
  setRange(i: number, v: string): void {
    const next = this.files().slice();
    next[i] = { ...next[i], range: v };
    this.files.set(next);
  }

  async onFilesSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const picked = input.files ? Array.from(input.files) : [];
    if (!picked.length) return;
    this.error.set('');
    this.status.set('');
    this.clearOutputs();
    const next = this.files().slice();
    for (const file of picked) {
      if (!this.isPdf(file)) {
        this.error.set(this.t('labels.errType').replace('{n}', file.name));
        continue;
      }
      if (file.size > MAX_BYTES) {
        this.error.set(this.t('labels.errSize').replace('{n}', file.name));
        continue;
      }
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(data, { ignoreEncryption: true });
        next.push({ name: file.name, data, pages: doc.getPageCount(), range: '' });
      } catch {
        this.error.set(this.t('labels.errParse').replace('{n}', file.name));
      }
    }
    this.files.set(next);
    input.value = '';
  }

  removeFile(i: number): void {
    const next = this.files().slice();
    next.splice(i, 1);
    this.files.set(next);
  }

  async rotate(): Promise<void> {
    const list = this.files();
    if (!list.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.clearOutputs();
    try {
      const out: RotOutput[] = [];
      for (const f of list) {
        const doc = await PDFDocument.load(f.data, { ignoreEncryption: true });
        const idxs = this.parseRanges(f.range, doc.getPageCount());
        for (const idx of idxs) {
          const page = doc.getPage(idx);
          const next = (page.getRotation().angle + this.angle()) % 360;
          page.setRotation(degrees(next));
        }
        const bytes = await doc.save({ useObjectStreams: true });
        const name = this.suffixed(f.name, `-rot${this.angle()}`);
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        out.push({ name, url: URL.createObjectURL(new Blob([ab], { type: 'application/pdf' })), bytes });
      }
      this.outputs.set(out);
      if (out.length === 1) {
        this.triggerDownload(out[0]);
      } else {
        const zip = this.buildZip(out.map((o) => ({ name: o.name, data: o.bytes })));
        this.downloadBytes(zip, 'rotated-pdfs.zip', 'application/zip');
      }
      this.status.set(this.t('labels.statusDone').replace('{n}', String(out.length)));
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  downloadOne(o: RotOutput): void {
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

  private triggerDownload(o: RotOutput): void {
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

  private parseRanges(input: string, total: number): number[] {
    const s = input.trim();
    if (!s) return Array.from({ length: total }, (_, i) => i);
    const out = new Set<number>();
    for (const part of s.split(',')) {
      const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) continue;
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let p = lo; p <= hi; p++) {
        if (p >= 1 && p <= total) out.add(p - 1);
      }
    }
    const arr = [...out].sort((x, y) => x - y);
    return arr.length ? arr : Array.from({ length: total }, (_, i) => i);
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private suffixed(name: string, suffix: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix + '.pdf';
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
