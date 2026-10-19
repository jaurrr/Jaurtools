import { effect } from '@angular/core';
import type { Title, Meta } from '@angular/platform-browser';
import type { TranslateService } from '../core/translate.service';

export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const IMG_MAX_BYTES = 10 * 1024 * 1024;

export interface PdfReadOk {
  ok: true;
  bytes: Uint8Array;
  name: string;
}
export interface PdfReadFail {
  ok: false;
  code: 'type' | 'size';
}
export type PdfRead = PdfReadOk | PdfReadFail;

export function readPdfInput(input: HTMLInputElement, maxBytes = PDF_MAX_BYTES): Promise<PdfRead> {
  const file = input.files?.[0];
  if (!file) return Promise.resolve({ ok: false, code: 'type' });
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return Promise.resolve({ ok: false, code: 'type' });
  if (file.size > maxBytes) return Promise.resolve({ ok: false, code: 'size' });
  return file
    .arrayBuffer()
    .then((buf) => ({ ok: true as const, bytes: new Uint8Array(buf), name: file.name }));
}

export function isPngFile(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  const b = dot > 0 ? name.slice(0, dot) : name;
  return b.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v).toString() : v.toFixed(1)} ${units[u]}`;
}

export function downloadBytes(doc: Document, bytes: Uint8Array, name: string, type: string): void {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const url = URL.createObjectURL(new Blob([ab], { type }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export interface PdfJsLib {
  getDocument: (src: unknown) => { promise: Promise<PdfJsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
}
export interface PdfJsDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
}
export interface PdfJsPage {
  getViewport: (opt: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
  render: (opt: unknown) => { promise: Promise<void> };
  cleanup?: () => void;
}
export interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function loadPdfJs(): Promise<PdfJsLib> {
  const lib = (await import('pdfjs-dist')) as unknown as PdfJsLib;
  lib.GlobalWorkerOptions.workerSrc = 'assets/pdf-worker/pdf.worker.min.js';
  return lib;
}

function crcTable(): Uint32Array {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tbl[n] = c >>> 0;
  }
  return tbl;
}
const CRC_TBL = crcTable();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TBL[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatParts(parts: Uint8Array[]): Uint8Array {
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

export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
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
    const crc = crc32(f.data);
    const lh = concatParts([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length),
      u16(nameB.length), u16(0), nameB, f.data,
    ]);
    local.push(lh);
    central.push(
      concatParts([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0),
        u16(0), u32(crc), u32(f.data.length), u32(f.data.length),
        u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset), nameB,
      ]),
    );
    offset += lh.length;
  }
  const cd = concatParts(central);
  const end = concatParts([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0),
  ]);
  return concatParts([...local, cd, end]);
}

export interface SeoHost {
  slug: string;
  translate: TranslateService;
  t: (key: string) => string;
  faqs: () => { q: string; a: string }[];
}

export function attachToolSeo(host: SeoHost, pageTitle: Title, meta: Meta, doc: Document): () => void {
  effect(() => {
    host.translate.lang();
    pageTitle.setTitle(host.t('metaTitle'));
    meta.updateTag({ name: 'description', content: host.t('metaDescription') });
    meta.updateTag({ name: 'keywords', content: host.t('keywords') });
    setLink(doc, 'canonical', `https://jaurtools.com/${host.translate.lang()}/${host.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      setLink(doc, 'alternate', `https://jaurtools.com/${l}/${host.slug}`, l);
    }
    refreshJsonLd(doc, host.faqs());
  });
  return () => {
    const el = doc.head.querySelector('script[data-tool-faq]');
    el?.remove();
    doc.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((n) => n.remove());
  };
}

function setLink(doc: Document, rel: string, href: string, hreflang?: string): void {
  const head = doc.head;
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = doc.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    head.appendChild(el);
  }
  el.href = href;
}

function refreshJsonLd(doc: Document, faqs: { q: string; a: string }[]): void {
  doc.head.querySelector('script[data-tool-faq]')?.remove();
  const mainEntity = faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  }));
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  }).replace(/</g, '\\u003c');
  const el = doc.createElement('script');
  el.type = 'application/ld+json';
  el.setAttribute('data-tool-faq', '1');
  el.textContent = json;
  doc.head.appendChild(el);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a5: [419.53, 595.28],
};
