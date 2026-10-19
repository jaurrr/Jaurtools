import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const DELIMS: Record<string, string> = { ',': ',', ';': ';', '\t': '\t', '|': '|' };

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, 5).filter((l) => l.trim().length > 0);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    let consistent = true;
    let prev = -1;
    for (const line of lines) {
      const count = line.split(d).length - 1;
      if (prev >= 0 && count !== prev) consistent = false;
      prev = count;
      score += count;
    }
    if (consistent) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      continue;
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }
  return rows;
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
    .map(
      (s, si) =>
        `<sheet name="${escXml(s.name).replace(/"/g, '&quot;')}" sheetId="${si + 1}" r:id="rId${si + 1}"/>`
    )
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

@Component({
  selector: 'app-csv-to-excel',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './csv-to-excel.component.html',
  styleUrl: './csv-to-excel.component.scss',
})
export class CsvToExcelComponent implements OnDestroy {
  readonly slug = 'csv-to-excel';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['excel-to-csv', 'csv-to-json', 'split-excel-workbook', 'csv-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('');
  readonly delimiter = signal<'auto' | ',' | ';' | 'tab' | 'pipe'>('auto');
  readonly sheetName = signal('Sheet1');
  readonly busy = signal(false);
  readonly error = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly resolvedDelim = computed(() =>
    this.delimiter() === 'auto' ? detectDelimiter(this.inputText()) : DELIMS[this.delimiter()]
  );

  readonly rows = computed(() => {
    const text = this.inputText();
    if (!text.trim()) return [] as string[][];
    const rows = parseCsv(text, this.resolvedDelim());
    const width = Math.max(0, ...rows.map((r) => r.length));
    return rows.map((r) => {
      const copy = [...r];
      while (copy.length < width) copy.push('');
      return copy;
    });
  });

  readonly preview = computed(() => this.rows().slice(0, 8));
  readonly stats = computed(() => ({
    rows: this.rows().length,
    cols: this.rows().length ? this.rows()[0].length : 0,
  }));

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

  setInput(v: string): void {
    this.inputText.set(v);
  }
  setDelimiter(v: 'auto' | ',' | ';' | 'tab' | 'pipe'): void {
    this.delimiter.set(v);
  }
  setSheetName(v: string): void {
    this.sheetName.set(v.slice(0, 31));
  }
  loadSample(): void {
    this.inputText.set('name,age,city\nAarav Sharma,25,Mumbai\nPriya Verma,30,Delhi\nRohan Gupta,22,Jaipur');
    this.delimiter.set('auto');
  }
  clear(): void {
    this.inputText.set('');
    this.error.set('');
  }
  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => this.inputText.set(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  async convert(): Promise<void> {
    if (this.rows().length === 0 || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const name = this.sheetName().trim() || 'Sheet1';
      const blob = await buildXlsx([{ name, rows: this.rows() }]);
      const safe = name.replace(/[\\/:*?"<>|[\]]/g, '_');
      downloadBlob(blob, (safe || 'data') + '.xlsx');
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
