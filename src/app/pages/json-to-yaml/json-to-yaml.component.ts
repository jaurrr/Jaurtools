import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Rec = Record<string, unknown>;
type Fmt = 'json' | 'yaml' | 'xml' | 'csv';

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

function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function unionHeaders(records: Rec[]): string[] {
  const h: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!h.includes(k)) h.push(k);
  return h;
}

function stripYamlComment(line: string): string {
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function yamlScalar(s: string): unknown {
  const t = s.trim();
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return null;
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

interface YLine {
  indent: number;
  text: string;
}

function splitKeyValue(text: string): [string, string] | null {
  let inS = false;
  let inD = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ':' && !inS && !inD && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return null;
}

function parseYamlMap(lines: YLine[], start: number, indent: number): { obj: Rec; next: number } {
  const obj: Rec = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const kv = splitKeyValue(lines[i].text);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[0].replace(/^['"]|['"]$/g, '');
    if (kv[1] === '' && i + 1 < lines.length && lines[i + 1].indent > indent) {
      const nested = parseYamlMap(lines, i + 1, lines[i + 1].indent);
      obj[key] = nested.obj;
      i = nested.next;
    } else {
      obj[key] = yamlScalar(kv[1]);
      i++;
    }
  }
  return { obj, next: i };
}

function parseYaml(text: string): Rec[] {
  const lines: YLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stripped = stripYamlComment(raw);
    if (!stripped.trim()) continue;
    lines.push({ indent: stripped.length - stripped.trimStart().length, text: stripped.trim() });
  }
  if (!lines.length) return [];
  if (lines[0].text === '-' || lines[0].text.startsWith('- ')) {
    const records: Rec[] = [];
    const base = lines[0].indent;
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (ln.indent === base && (ln.text === '-' || ln.text.startsWith('- '))) {
        const rest = ln.text === '-' ? '' : ln.text.slice(2).trim();
        const obj: Rec = {};
        if (rest) {
          const kv = splitKeyValue(rest);
          if (kv) obj[kv[0].replace(/^['"]|['"]$/g, '')] = yamlScalar(kv[1]);
          else obj['value'] = yamlScalar(rest);
        }
        const nestedIndent =
          i + 1 < lines.length && lines[i + 1].indent > base ? lines[i + 1].indent : base + 2;
        const nested = parseYamlMap(lines, i + 1, nestedIndent);
        Object.assign(obj, nested.obj);
        records.push(obj);
        i = nested.next;
      } else {
        i++;
      }
    }
    return records;
  }
  const single = parseYamlMap(lines, 0, lines[0].indent);
  return [single.obj];
}

function yamlEmitScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const s = String(v);
  if (s === '' || /[:#\-\[\]{},&*!|>'"%@`?]/.test(s[0]) || /[:#]/.test(s) || /^\s|\s$/.test(s) || /^\d+$/.test(s)) {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return s;
}

function yamlStringify(records: Rec[]): string {
  const out: string[] = [];
  for (const r of records) {
    const keys = Object.keys(r);
    if (!keys.length) {
      out.push('- {}');
      continue;
    }
    keys.forEach((k, ki) => {
      const prefix = ki === 0 ? '- ' : '  ';
      const v = r[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        out.push(`${prefix}${k}:`);
        for (const sk of Object.keys(v as Rec)) out.push(`    ${sk}: ${yamlEmitScalar((v as Rec)[sk])}`);
      } else if (Array.isArray(v)) {
        out.push(`${prefix}${k}:`);
        for (const item of v) out.push(`    - ${yamlEmitScalar(item)}`);
      } else {
        out.push(`${prefix}${k}: ${yamlEmitScalar(v)}`);
      }
    });
  }
  return out.join('\n');
}

function xmlToRecords(text: string): Rec[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('bad-xml');
  const root = doc.documentElement;
  const rows = Array.from(root.children);
  return rows.map((row) => {
    const kids = Array.from(row.children);
    if (!kids.length) return { value: row.textContent ?? '' } as Rec;
    const obj: Rec = {};
    kids.forEach((k, i) => {
      const name = k.tagName.includes(':') ? k.tagName.split(':').pop()! : k.tagName;
      obj[name || `field${i + 1}`] = k.textContent ?? '';
    });
    return obj;
  });
}

function recordsToXml(records: Rec[], root: string, rowTag: string): string {
  const headers = unionHeaders(records);
  const safe = headers.map((h, i) => safeFieldName(h, i));
  const body = records
    .map((r) => {
      const cells = safe.map((s, i) => `    <${s}>${escXml(scalarToString(r[headers[i]]))}</${s}>`).join('\n');
      return `  <${rowTag}>\n${cells}\n  </${rowTag}>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`;
}

function parseInput(fmt: Fmt, text: string, csvDelim: string): Rec[] {
  const t = text.trim();
  if (!t) return [];
  if (fmt === 'json') {
    const v = JSON.parse(t);
    const arr = Array.isArray(v) ? v : [v];
    return arr.map((x) =>
      x !== null && typeof x === 'object' && !Array.isArray(x)
        ? (x as Rec)
        : ({ value: x } as Rec)
    );
  }
  if (fmt === 'yaml') return parseYaml(t);
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

function emitOutput(fmt: Fmt, records: Rec[], csvDelim: string, root: string, rowTag: string): string {
  if (fmt === 'json') return JSON.stringify(records, null, 2);
  if (fmt === 'yaml') return yamlStringify(records);
  if (fmt === 'xml') return recordsToXml(records, root, rowTag);
  const headers = unionHeaders(records);
  const rows = [headers, ...records.map((r) => headers.map((h) => scalarToString(r[h])))];
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

const EXT: Record<Fmt, string> = { json: 'json', yaml: 'yaml', xml: 'xml', csv: 'csv' };
const MIME: Record<Fmt, string> = {
  json: 'application/json;charset=utf-8',
  yaml: 'text/yaml;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
};

@Component({
  selector: 'app-json-to-yaml',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-to-yaml.component.html',
  styleUrl: './json-to-yaml.component.scss',
})
export class JsonToYamlComponent implements OnDestroy {
  readonly slug = 'json-to-yaml';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-to-csv', 'json-xml-csv-converter', 'csv-to-json', 'csv-to-xml'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly from = signal<Fmt>('json');
  readonly to = signal<Fmt>('csv');
  readonly inputText = signal('');
  readonly delimiter = signal<',' | ';' | 'tab' | 'pipe'>(',');
  readonly rootName = signal('rows');
  readonly rowName = signal('row');
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

  readonly conversion = computed((): { ok: boolean; text: string; error: string; records: number; fields: number } => {
    const text = this.inputText();
    if (!text.trim()) return { ok: false, text: '', error: '', records: 0, fields: 0 };
    if (this.to() === 'xml' && !this.namesValid())
      return { ok: false, text: '', error: this.t('labels.invalidName'), records: 0, fields: 0 };
    try {
      const records = parseInput(this.from(), text, this.csvDelim());
      const out = emitOutput(this.to(), records, this.csvDelim(), this.rootName().trim(), this.rowName().trim());
      return { ok: true, text: out, error: '', records: records.length, fields: unionHeaders(records).length };
    } catch {
      return { ok: false, text: '', error: this.t('labels.errorParse'), records: 0, fields: 0 };
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
  swap(): void {
    const f = this.from();
    this.from.set(this.to());
    this.to.set(f);
    this.inputText.set(this.conversion().ok ? this.conversion().text : '');
  }
  loadSample(): void {
    const f = this.from();
    if (f === 'json') this.inputText.set('[{"name":"Aarav Sharma","age":25},{"name":"Priya Verma","age":30}]');
    else if (f === 'yaml')
      this.inputText.set('- name: Aarav Sharma\n  age: 25\n- name: Priya Verma\n  age: 30');
    else if (f === 'xml')
      this.inputText.set(
        '<?xml version="1.0"?>\n<rows>\n  <row>\n    <name>Aarav Sharma</name>\n    <age>25</age>\n  </row>\n</rows>'
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
