import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Rec = Record<string, unknown>;
type Fmt = 'json' | 'xml' | 'csv';

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

function toCsv(rows: string[][], delim: string): string {
  return rows
    .map((r) =>
      r
        .map((f) => {
          const s = f ?? '';
          return /["\n\r]/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(delim)
    )
    .join('\r\n');
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

function localName(tag: string): string {
  return tag.includes(':') ? tag.split(':').pop()! : tag;
}

function xmlNodeToJson(el: Element): unknown {
  const kids = Array.from(el.children);
  const attrs = Array.from(el.attributes);
  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();
  if (!kids.length && !attrs.length) return el.textContent ?? '';
  const obj: Rec = {};
  for (const a of attrs) obj['@' + localName(a.name)] = a.value;
  const groups = new Map<string, Element[]>();
  for (const k of kids) {
    const name = localName(k.tagName);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(k);
  }
  for (const [name, list] of groups) {
    const vals = list.map((k) => xmlNodeToJson(k));
    obj[name] = vals.length === 1 ? vals[0] : vals;
  }
  if (text) obj['#text'] = text;
  return obj;
}

function xmlToRecords(text: string): Rec[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('bad-xml');
  const root = doc.documentElement;
  const rows = Array.from(root.children);
  return rows.map((row) => {
    const v = xmlNodeToJson(row);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : ({ value: v } as Rec);
  });
}

function jsonValueToXml(tag: string, value: unknown, indent: string): string {
  if (value === null || value === undefined) return `${indent}<${tag}/>`;
  if (Array.isArray(value)) return value.map((v) => jsonValueToXml(tag, v, indent)).join('\n');
  if (typeof value !== 'object') return `${indent}<${tag}>${escXml(String(value))}</${tag}>`;
  const obj = value as Rec;
  const attrs = Object.keys(obj)
    .filter((k) => k.startsWith('@') && typeof obj[k] !== 'object')
    .map((k) => ` ${escXml(k.slice(1))}="${escXml(String(obj[k]))}"`)
    .join('');
  const kids = Object.keys(obj).filter((k) => !k.startsWith('@') && k !== '#text');
  const text = obj['#text'] !== undefined && typeof obj['#text'] !== 'object' ? escXml(String(obj['#text'])) : '';
  if (!kids.length) return `${indent}<${tag}${attrs}>${text}</${tag}>`;
  const inner = kids
    .map((k) => jsonValueToXml(safeFieldName(k, 0), obj[k], indent + '  '))
    .join('\n');
  return `${indent}<${tag}${attrs}>${text ? text : ''}\n${inner}\n${indent}</${tag}>`;
}

function recordsToXml(records: Rec[], root: string, rowTag: string): string {
  const body = records.map((r) => jsonValueToXml(rowTag, r, '  ')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`;
}

function flatten(obj: unknown, prefix: string, out: Rec): void {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj as Rec);
    if (!keys.length) {
      out[prefix] = '';
      return;
    }
    for (const k of keys) flatten((obj as Rec)[k], prefix ? prefix + '.' + k : k, out);
  } else if (Array.isArray(obj)) {
    out[prefix] = JSON.stringify(obj);
  } else if (obj === null || obj === undefined) {
    out[prefix] = '';
  } else {
    out[prefix] = String(obj);
  }
}

function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function parseInput(fmt: Fmt, text: string, csvDelim: string): Rec[] {
  const t = text.trim();
  if (!t) return [];
  if (fmt === 'json') {
    const v = JSON.parse(t);
    const arr = Array.isArray(v) ? v : [v];
    return arr.map((x) =>
      x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : ({ value: x } as Rec)
    );
  }
  if (fmt === 'xml') return xmlToRecords(t);
  const rows = parseCsv(t, csvDelim).filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return [];
  const headers = rows[0].map((h, i) => (h.trim() === '' ? `column${i + 1}` : h));
  return rows.slice(1).map((r) => {
    const obj: Rec = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

function emitOutput(
  fmt: Fmt,
  records: Rec[],
  csvDelim: string,
  root: string,
  rowTag: string,
  doFlatten: boolean
): string {
  if (fmt === 'json') return JSON.stringify(records, null, 2);
  if (fmt === 'xml') return recordsToXml(records, root, rowTag);
  const flat = records.map((r) => {
    if (!doFlatten) {
      const o: Rec = {};
      for (const k of Object.keys(r)) o[k] = scalarToString(r[k]);
      return o;
    }
    const o: Rec = {};
    flatten(r, '', o);
    return o;
  });
  const headers: string[] = [];
  for (const r of flat) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
  const rows = [headers, ...flat.map((r) => headers.map((h) => String(r[h] ?? '')))];
  return toCsv(rows, csvDelim);
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

const EXT: Record<Fmt, string> = { json: 'json', xml: 'xml', csv: 'csv' };
const MIME: Record<Fmt, string> = {
  json: 'application/json;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
};

@Component({
  selector: 'app-json-xml-csv-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-xml-csv-converter.component.html',
  styleUrl: './json-xml-csv-converter.component.scss',
})
export class JsonXmlCsvConverterComponent implements OnDestroy {
  readonly slug = 'json-xml-csv-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-to-yaml', 'json-to-csv', 'csv-to-xml', 'excel-to-xml'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly from = signal<Fmt>('json');
  readonly to = signal<Fmt>('xml');
  readonly inputText = signal('');
  readonly delimiter = signal<',' | ';' | 'tab' | 'pipe'>(',');
  readonly rootName = signal('rows');
  readonly rowName = signal('row');
  readonly flattenNested = signal(true);
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

  readonly csvDelim = computed(() =>
    this.delimiter() === 'tab' ? '\t' : this.delimiter() === 'pipe' ? '|' : this.delimiter()
  );

  readonly namesValid = computed(
    () => XML_NAME_RE.test(this.rootName().trim()) && XML_NAME_RE.test(this.rowName().trim())
  );

  readonly conversion = computed((): { ok: boolean; text: string; error: string; records: number } => {
    const text = this.inputText();
    if (!text.trim()) return { ok: false, text: '', error: '', records: 0 };
    if (this.to() === 'xml' && !this.namesValid())
      return { ok: false, text: '', error: this.t('labels.invalidName'), records: 0 };
    try {
      const records = parseInput(this.from(), text, this.csvDelim());
      const out = emitOutput(
        this.to(),
        records,
        this.csvDelim(),
        this.rootName().trim(),
        this.rowName().trim(),
        this.flattenNested()
      );
      return { ok: true, text: out, error: '', records: records.length };
    } catch {
      return { ok: false, text: '', error: this.t('labels.errorParse'), records: 0 };
    }
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

  setFrom(v: Fmt): void {
    this.from.set(v);
    if (this.to() === v) this.to.set(v === 'csv' ? 'json' : 'csv');
  }
  setTo(v: Fmt): void {
    this.to.set(v);
  }
  setInput(v: string): void {
    this.inputText.set(v);
  }
  setDelimiter(v: ',' | ';' | 'tab' | 'pipe'): void {
    this.delimiter.set(v);
  }
  setRootName(v: string): void {
    this.rootName.set(v.slice(0, 40));
  }
  setRowName(v: string): void {
    this.rowName.set(v.slice(0, 40));
  }
  toggleFlatten(): void {
    this.flattenNested.set(!this.flattenNested());
  }
  swap(): void {
    const f = this.from();
    this.from.set(this.to());
    this.to.set(f);
    const c = this.conversion();
    this.inputText.set(c.ok ? c.text : '');
  }
  loadSample(): void {
    const f = this.from();
    if (f === 'json')
      this.inputText.set(
        '[{"name":"Aarav Sharma","address":{"city":"Mumbai","pin":"400001"},"tags":["vip","new"]}]'
      );
    else if (f === 'xml')
      this.inputText.set(
        '<?xml version="1.0"?>\n<users>\n  <user id="1">\n    <name>Aarav Sharma</name>\n  </user>\n</users>'
      );
    else this.inputText.set('name,age\nAarav Sharma,25\nPriya Verma,30');
  }
  clear(): void {
    this.inputText.set('');
  }
  async copyOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.conversion().text).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }
  download(): void {
    const c = this.conversion();
    if (!c.ok) return;
    downloadBlob(new Blob([c.text], { type: MIME[this.to()] }), 'converted.' + EXT[this.to()]);
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
