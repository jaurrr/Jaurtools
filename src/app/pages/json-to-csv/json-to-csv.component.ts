import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

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

function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function jsonToRows(data: unknown): string[][] {
  const arr = Array.isArray(data) ? data : [data];
  const objs = arr.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x)) as Record<
    string,
    unknown
  >[];
  if (!objs.length) return [];
  const headers: string[] = [];
  for (const o of objs) for (const k of Object.keys(o)) if (!headers.includes(k)) headers.push(k);
  return [
    headers,
    ...objs.map((o) => headers.map((h) => scalarToString(o[h]))),
  ];
}

function csvToJson(rows: string[][]): unknown[] {
  if (!rows.length) return [];
  const headers = rows[0].map((h, i) => (h.trim() === '' ? `column${i + 1}` : h));
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
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
  selector: 'app-json-to-csv',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-to-csv.component.html',
  styleUrl: './json-to-csv.component.scss',
})
export class JsonToCsvComponent implements OnDestroy {
  readonly slug = 'json-to-csv';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['csv-to-json', 'json-to-yaml', 'json-xml-csv-converter', 'csv-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'json2csv' | 'csv2json'>('json2csv');
  readonly inputText = signal('');
  readonly delimiter = signal<',' | ';' | 'tab' | 'pipe'>(',');
  readonly pretty = signal(true);
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

  readonly parsed = computed((): { ok: boolean; value: unknown; error: string } => {
    if (this.mode() === 'csv2json') return { ok: true, value: null, error: '' };
    const text = this.inputText().trim();
    if (!text) return { ok: false, value: null, error: '' };
    try {
      return { ok: true, value: JSON.parse(text), error: '' };
    } catch {
      return { ok: false, value: null, error: this.t('labels.errorJson') };
    }
  });

  readonly output = computed(() => {
    const text = this.inputText();
    if (!text.trim()) return '';
    if (this.mode() === 'json2csv') {
      const p = this.parsed();
      if (!p.ok) return '';
      const delim = this.delimiter() === 'tab' ? '\t' : this.delimiter() === 'pipe' ? '|' : this.delimiter();
      const rows = jsonToRows(p.value);
      if (!rows.length) return '';
      return toCsv(rows, delim);
    }
    const delim = this.delimiter() === 'tab' ? '\t' : this.delimiter() === 'pipe' ? '|' : this.delimiter();
    const rows = parseCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) return '';
    const data = csvToJson(rows);
    return this.pretty() ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  });

  readonly stats = computed(() => {
    if (this.mode() === 'json2csv') {
      const p = this.parsed();
      if (!p.ok) return { a: 0, b: 0 };
      const rows = jsonToRows(p.value);
      return { a: Math.max(0, rows.length - 1), b: rows.length ? rows[0].length : 0 };
    }
    const text = this.inputText();
    if (!text.trim()) return { a: 0, b: 0 };
    const delim = this.delimiter() === 'tab' ? '\t' : this.delimiter() === 'pipe' ? '|' : this.delimiter();
    const rows = parseCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''));
    return { a: Math.max(0, rows.length - 1), b: rows.length ? rows[0].length : 0 };
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

  setMode(m: 'json2csv' | 'csv2json'): void {
    this.mode.set(m);
  }
  setInput(v: string): void {
    this.inputText.set(v);
  }
  setDelimiter(v: ',' | ';' | 'tab' | 'pipe'): void {
    this.delimiter.set(v);
  }
  togglePretty(): void {
    this.pretty.set(!this.pretty());
  }
  loadSample(): void {
    if (this.mode() === 'json2csv') {
      this.inputText.set('[{"name":"Aarav Sharma","age":25},{"name":"Priya Verma","age":30}]');
    } else {
      this.inputText.set('name,age\nAarav Sharma,25\nPriya Verma,30');
    }
  }
  clear(): void {
    this.inputText.set('');
  }
  async copyOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.output()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }
  download(): void {
    if (!this.output()) return;
    if (this.mode() === 'json2csv') {
      downloadBlob(new Blob([this.output()], { type: 'text/csv;charset=utf-8' }), 'data.csv');
    } else {
      downloadBlob(new Blob([this.output()], { type: 'application/json;charset=utf-8' }), 'data.json');
    }
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
