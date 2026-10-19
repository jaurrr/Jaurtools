import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface AddedFile {
  name: string;
  size: number;
  data: Uint8Array;
}

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<{ bytes: Uint8Array; ok: boolean }> {
  try {
    if (typeof CompressionStream === 'undefined' || data.length === 0) return { bytes: data, ok: false };
    const stream = new Blob([data as unknown as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    return out.length < data.length ? { bytes: out, ok: true } : { bytes: data, ok: false };
  } catch {
    return { bytes: data, ok: false };
  }
}

async function buildZip(entries: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const body: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const comp = await deflateRaw(e.data);
    const method = comp.ok ? 8 : 0;
    const payload = comp.bytes;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, payload.length, true);
    lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    body.push(lh.buffer, nameBytes, payload as unknown as BlobPart);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, payload.length, true);
    ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameBytes);
    offset += 30 + nameBytes.length + payload.length;
    centralSize += 46 + nameBytes.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...body, ...central, eocd.buffer], { type: 'application/zip' });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r} ${units[i]}`;
}

@Component({
  selector: 'app-create-zip',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './create-zip.component.html',
  styleUrl: './create-zip.component.scss',
})
export class CreateZipComponent implements OnDestroy {
  readonly slug = 'create-zip';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['join-files', 'split-csv', 'csv-to-excel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly files = signal<AddedFile[]>([]);
  readonly zipName = signal('archive');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly doneInfo = signal('');

  readonly totalSize = computed(() => this.files().reduce((a, f) => a + f.size, 0));
  readonly totalSizeLabel = computed(() => formatBytes(this.totalSize()));
  readonly canBuild = computed(
    () => this.files().length > 0 && !this.busy() && this.zipName().trim().length > 0
  );

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

  setZipName(v: string): void {
    this.zipName.set(v.slice(0, 80));
  }
  fmt(n: number): string {
    return formatBytes(n);
  }

  async onFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    this.error.set('');
    const MAX_TOTAL = 300 * 1024 * 1024;
    const current = [...this.files()];
    let total = this.totalSize();
    for (const f of picked) {
      if (total + f.size > MAX_TOTAL) {
        this.error.set(this.t('labels.errorTooBig'));
        break;
      }
      const data = new Uint8Array(await f.arrayBuffer());
      current.push({ name: f.name, size: f.size, data });
      total += f.size;
    }
    this.files.set(current);
  }

  removeFile(i: number): void {
    this.files.set(this.files().filter((_, idx) => idx !== i));
  }

  clearAll(): void {
    this.files.set([]);
    this.doneInfo.set('');
    this.error.set('');
  }

  async createZip(): Promise<void> {
    if (!this.canBuild()) return;
    this.busy.set(true);
    this.error.set('');
    this.doneInfo.set('');
    try {
      const blob = await buildZip(this.files().map((f) => ({ name: f.name, data: f.data })));
      const base = this.zipName().trim().replace(/[\\/:*?"<>|]/g, '_') || 'archive';
      downloadBlob(blob, base.toLowerCase().endsWith('.zip') ? base : base + '.zip');
      this.doneInfo.set(
        this.t('labels.done')
          .replace('{n}', String(this.files().length))
          .replace('{s}', formatBytes(blob.size))
      );
    } catch {
      this.error.set(this.t('labels.errorBuild'));
    } finally {
      this.busy.set(false);
    }
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
