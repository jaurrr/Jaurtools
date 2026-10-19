import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface XlsxSheet {
  name: string;
  rows: string[][];
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf);
  let eocd = -1;
  const start = Math.max(0, dv.byteLength - 22 - 65535);
  for (let i = dv.byteLength - 22; i >= start; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not-zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad-cd');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lhOff = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    const lhNameLen = dv.getUint16(lhOff + 26, true);
    const lhExtraLen = dv.getUint16(lhOff + 28, true);
    const dataOff = lhOff + 30 + lhNameLen + lhExtraLen;
    let data = new Uint8Array(buf, dataOff, compSize);
    if (method === 8) data = await inflateRaw(data);
    else if (method !== 0) throw new Error('bad-method');
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function elsByTag(parent: Document | Element, local: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', local));
}

function colIndex(ref: string): number {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return -1;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}

async function readXlsx(buf: ArrayBuffer): Promise<XlsxSheet[]> {
  const files = await readZip(buf);
  const dec = new TextDecoder();
  const get = (n: string): string => {
    const f = files.get(n);
    if (!f) throw new Error('missing:' + n);
    return dec.decode(f);
  };
  const parser = new DOMParser();
  const wbDoc = parser.parseFromString(get('xl/workbook.xml'), 'application/xml');
  if (elsByTag(wbDoc, 'parsererror').length) throw new Error('bad-xml');
  const sheetEls = elsByTag(wbDoc, 'sheet');
  if (!sheetEls.length) throw new Error('no-sheets');
  const relsDoc = parser.parseFromString(get('xl/_rels/workbook.xml.rels'), 'application/xml');
  const relMap = new Map<string, string>();
  for (const r of elsByTag(relsDoc, 'Relationship')) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (id && target) relMap.set(id, target);
  }
  let shared: string[] = [];
  if (files.has('xl/sharedStrings.xml')) {
    const ssDoc = parser.parseFromString(get('xl/sharedStrings.xml'), 'application/xml');
    shared = elsByTag(ssDoc, 'si').map((si) => si.textContent ?? '');
  }
  const out: XlsxSheet[] = [];
  for (const s of sheetEls) {
    const name = s.getAttribute('name') ?? 'Sheet';
    const rid = s.getAttribute('r:id');
    const target = rid ? relMap.get(rid) : undefined;
    if (!target) continue;
    const path = target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\//, '');
    const sheetDoc = parser.parseFromString(get(path), 'application/xml');
    const grid: string[][] = [];
    for (const rowEl of elsByTag(sheetDoc, 'row')) {
      const rAttr = rowEl.getAttribute('r');
      const rIdx = rAttr ? parseInt(rAttr, 10) - 1 : grid.length;
      while (grid.length <= rIdx) grid.push([]);
      for (const c of elsByTag(rowEl, 'c')) {
        const ci = colIndex(c.getAttribute('r') ?? '');
        if (ci < 0) continue;
        const t = c.getAttribute('t') ?? '';
        const vEl = elsByTag(c, 'v')[0];
        let val: string;
        if (t === 's') {
          const idx = vEl ? parseInt(vEl.textContent ?? '0', 10) : 0;
          val = shared[idx] ?? '';
        } else if (t === 'inlineStr') {
          val = elsByTag(c, 't')[0]?.textContent ?? '';
        } else if (t === 'b') {
          val = (vEl?.textContent ?? '0') === '1' ? 'TRUE' : 'FALSE';
        } else {
          val = vEl?.textContent ?? '';
        }
        while (grid[rIdx].length <= ci) grid[rIdx].push('');
        grid[rIdx][ci] = val;
      }
    }
    while (grid.length && grid[grid.length - 1].every((c) => c === '')) grid.pop();
    out.push({ name, rows: grid });
  }
  if (!out.length) throw new Error('no-sheets');
  return out;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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
  return new Blob([...body, ...central, eocd.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const NUM_RE = /^-?\d+(\.\d+)?$/;

async function buildXlsx(sheets: { name: string; rows: string[][] }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const sheetFiles = sheets.map((s, si) => {
    const sheetRows = s.rows
      .map((r, ri) => {
        const cells = r
          .map((v, ci) => {
            const ref = colName(ci) + (ri + 1);
            const val = (v ?? '').trim();
            if (NUM_RE.test(val)) return `<c r="${ref}"><v>${val}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t>${escXml(val)}</t></is></c>`;
          })
          .join('');
        return `<row r="${ri + 1}">${cells}</row>`;
      })
      .join('');
    return {
      name: `xl/worksheets/sheet${si + 1}.xml`,
      xml:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${sheetRows}</sheetData></worksheet>`,
    };
  });
  const sheetRefs = sheets
    .map((s, si) => `<sheet name="${escXml(s.name).replace(/"/g, '&quot;')}" sheetId="${si + 1}" r:id="rId${si + 1}"/>`)
    .join('');
  const rels = sheets
    .map(
      (s, si) =>
        `<Relationship Id="rId${si + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${si + 1}.xml"/>`
    )
    .join('');
  const overrides = sheets
    .map(
      (s, si) =>
        `<Override PartName="/xl/worksheets/sheet${si + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');
  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          overrides +
          `</Types>`
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${sheetRefs}</sheets></workbook>`
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          rels +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      ),
    },
    {
      name: 'xl/styles.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
          `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
          `<borders count="1"><border/></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
          `</styleSheet>`
      ),
    },
    ...sheetFiles.map((s) => ({ name: s.name, data: enc.encode(s.xml) })),
  ];
  return buildZip(files);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Component({
  selector: 'app-split-excel-workbook',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './split-excel-workbook.component.html',
  styleUrl: './split-excel-workbook.component.scss',
})
export class SplitExcelWorkbookComponent implements OnDestroy {
  readonly slug = 'split-excel-workbook';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['split-excel-workbook', 'excel-to-csv', 'csv-to-excel', 'split-csv'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sheets = signal<XlsxSheet[]>([]);
  readonly selected = signal<boolean[]>([]);
  readonly fileName = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly doneInfo = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly selectedCount = computed(() => this.selected().filter(Boolean).length);

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

  toggleSheet(i: number): void {
    const arr = [...this.selected()];
    arr[i] = !arr[i];
    this.selected.set(arr);
  }
  selectAll(): void {
    this.selected.set(this.sheets().map(() => true));
  }
  selectNone(): void {
    this.selected.set(this.sheets().map(() => false));
  }
  sheetRows(i: number): number {
    return this.sheets()[i]?.rows.length ?? 0;
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.loading.set(true);
    this.error.set('');
    this.sheets.set([]);
    this.selected.set([]);
    this.doneInfo.set('');
    try {
      const buf = await f.arrayBuffer();
      const sheets = await readXlsx(buf);
      this.sheets.set(sheets);
      this.selected.set(sheets.map(() => true));
      this.fileName.set(f.name.replace(/\.xlsx$/i, ''));
    } catch {
      this.error.set(this.t('labels.errorParse'));
    } finally {
      this.loading.set(false);
    }
  }

  async split(): Promise<void> {
    const sheets = this.sheets();
    const chosen = sheets.filter((_, i) => this.selected()[i]);
    if (!chosen.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.doneInfo.set('');
    try {
      const base = (this.fileName() || 'workbook').replace(/[\\/:*?"<>|]/g, '_');
      let idx = 0;
      for (const sheet of chosen) {
        idx++;
        const blob = await buildXlsx([{ name: sheet.name, rows: sheet.rows }]);
        const safe = sheet.name.replace(/[\\/:*?"<>|[\]]/g, '_') || `sheet${idx}`;
        downloadBlob(blob, `${base}-${safe}.xlsx`);
        await sleep(700);
      }
      this.doneInfo.set(this.t('labels.done').replace('{n}', String(chosen.length)));
    } catch {
      this.error.set(this.t('labels.errorSplit'));
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
