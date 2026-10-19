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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
function safeFieldName(s: string, i: number): string {
  let name = s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '');
  if (!/^[A-Za-z_]/.test(name)) name = 'field_' + name;
  if (name === '' || name === '_') name = `field${i + 1}`;
  return name;
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
  selector: 'app-excel-to-xml',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './excel-to-xml.component.html',
  styleUrl: './excel-to-xml.component.scss',
})
export class ExcelToXmlComponent implements OnDestroy {
  readonly slug = 'excel-to-xml';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['excel-to-csv', 'csv-to-xml', 'json-xml-csv-converter', 'split-excel-workbook'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sheets = signal<XlsxSheet[]>([]);
  readonly fileName = signal('');
  readonly sheetIndex = signal(0);
  readonly firstRowHeader = signal(true);
  readonly rootName = signal('rows');
  readonly rowName = signal('row');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly activeSheet = computed(() => this.sheets()[this.sheetIndex()] ?? null);

  readonly namesValid = computed(
    () => XML_NAME_RE.test(this.rootName().trim()) && XML_NAME_RE.test(this.rowName().trim())
  );

  readonly xmlText = computed(() => {
    const sheet = this.activeSheet();
    if (!sheet || !sheet.rows.length || !this.namesValid()) return '';
    const root = this.rootName().trim();
    const rowTag = this.rowName().trim();
    const rows = sheet.rows;
    const headers = this.firstRowHeader()
      ? rows[0].map((h, i) => safeFieldName(h, i))
      : rows[0].map((_, i) => `field${i + 1}`);
    const dataRows = this.firstRowHeader() ? rows.slice(1) : rows;
    const body = dataRows
      .map((r) => {
        const cells = r.map((c, i) => `    <${headers[i]}>${escXml(c)}</${headers[i]}>`).join('\n');
        return `  <${rowTag}>\n${cells}\n  </${rowTag}>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`;
  });

  readonly stats = computed(() => {
    const sheet = this.activeSheet();
    const rows = sheet?.rows ?? [];
    return {
      sheets: this.sheets().length,
      records: this.firstRowHeader() ? Math.max(0, rows.length - 1) : rows.length,
      fields: rows.length ? Math.max(...rows.map((r) => r.length)) : 0,
    };
  });

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

  setSheetIndex(v: number): void {
    this.sheetIndex.set(v);
  }
  setRootName(v: string): void {
    this.rootName.set(v.slice(0, 40));
  }
  setRowName(v: string): void {
    this.rowName.set(v.slice(0, 40));
  }
  toggleHeader(): void {
    this.firstRowHeader.set(!this.firstRowHeader());
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.loading.set(true);
    this.error.set('');
    this.sheets.set([]);
    try {
      const buf = await f.arrayBuffer();
      const sheets = await readXlsx(buf);
      this.sheets.set(sheets);
      this.fileName.set(f.name.replace(/\.xlsx$/i, ''));
      this.sheetIndex.set(0);
    } catch {
      this.error.set(this.t('labels.errorParse'));
    } finally {
      this.loading.set(false);
    }
  }

  async copyOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.xmlText()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }
  download(): void {
    if (!this.xmlText()) return;
    const base = (this.fileName() || 'data').replace(/[\\/:*?"<>|]/g, '_');
    downloadBlob(new Blob([this.xmlText()], { type: 'application/xml;charset=utf-8' }), base + '.xml');
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
