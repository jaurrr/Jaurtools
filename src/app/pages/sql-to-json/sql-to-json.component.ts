import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CellValue = string | number | null;

interface SqlParseResult {
  ok: boolean;
  error: string;
  columns: string[];
  rows: CellValue[][];
}

const SAMPLE_SQL = `INSERT INTO customers (id, name, city, balance) VALUES
(1, 'Asha Verma', 'Jaipur', 1500.50),
(2, 'Ravi, Kumar', NULL, 230),
(3, 'O''Brien', 'Kochi', 0);`;

@Component({
  selector: 'app-sql-to-json',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sql-to-json.component.html',
  styleUrl: './sql-to-json.component.scss',
})
export class SqlToJsonComponent implements OnDestroy {
  readonly slug = 'sql-to-json';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['split-files', 'xml-to-csv', 'xml-to-excel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sqlText = signal('');
  readonly format = signal<'json' | 'csv'>('json');
  readonly copied = signal(false);

  private blobUrls: string[] = [];
  private copyTimer = 0;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed<SqlParseResult>(() => this.parseSql(this.sqlText()));

  readonly output = computed(() => {
    const p = this.parsed();
    if (!p.ok) return '';
    return this.format() === 'json' ? this.toJson(p) : this.toCsv(p);
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

  setSqlText(v: string) {
    this.sqlText.set(v);
  }
  setFormat(f: 'json' | 'csv') {
    this.format.set(f);
  }
  loadSample() {
    this.sqlText.set(SAMPLE_SQL);
  }
  clearAll() {
    this.sqlText.set('');
    this.copied.set(false);
  }

  async copyOutput() {
    const out = this.output();
    if (!out) return;
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(out).catch(() => undefined);
      this.copied.set(true);
      window.clearTimeout(this.copyTimer);
      this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  download() {
    const out = this.output();
    if (!out) return;
    const isJson = this.format() === 'json';
    const blob = new Blob([out], {
      type: isJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = isJson ? 'result-set.json' : 'result-set.csv';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy() {
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
    window.clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseSql(text: string): SqlParseResult {
    const fail = (key: string): SqlParseResult => ({
      ok: false,
      error: this.t(`labels.${key}`),
      columns: [],
      rows: [],
    });
    const empty: SqlParseResult = { ok: false, error: '', columns: [], rows: [] };
    const trimmed = text.trim();
    if (!trimmed) return empty;

    const insertRe = /INSERT\s+INTO\s+[`"\[]?[\w.]+[`"\]]?\s*\(([^)]+)\)/gi;
    let m: RegExpExecArray | null;
    let columns: string[] = [];
    while ((m = insertRe.exec(trimmed)) !== null) {
      if (columns.length === 0) {
        columns = m[1].split(',').map((c) => c.trim().replace(/^[`"\[]+|[`"\]]+$/g, ''));
      }
    }
    if (columns.length === 0) return fail('errorNoInsert');

    const rows: CellValue[][] = [];
    const valuesRe = /VALUES\s*/gi;
    let vm: RegExpExecArray | null;
    while ((vm = valuesRe.exec(trimmed)) !== null) {
      let i = valuesRe.lastIndex;
      while (i < trimmed.length && trimmed[i] !== ';') {
        while (i < trimmed.length && /[\s,]/.test(trimmed[i])) i++;
        if (i >= trimmed.length || trimmed[i] === ';') break;
        if (trimmed[i] !== '(') {
          i++;
          continue;
        }
        const found = this.readTuple(trimmed, i);
        if (found.tuple === null) break;
        rows.push(this.splitTuple(found.tuple).map((v) => this.parseValue(v)));
        i = found.end;
      }
    }
    if (rows.length === 0) return fail('errorNoValues');
    return { ok: true, error: '', columns, rows };
  }

  private readTuple(s: string, start: number): { tuple: string | null; end: number } {
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (quote) {
        if (c === quote) {
          if (s[i + 1] === quote) {
            i++;
            continue;
          }
          quote = null;
        }
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return { tuple: s.slice(start + 1, i), end: i + 1 };
      }
    }
    return { tuple: null, end: s.length };
  }

  private splitTuple(tuple: string): string[] {
    const parts: string[] = [];
    let cur = '';
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < tuple.length; i++) {
      const c = tuple[i];
      if (quote) {
        cur += c;
        if (c === quote) {
          if (tuple[i + 1] === quote) cur += tuple[++i];
          else quote = null;
        }
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        cur += c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (c === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    parts.push(cur);
    return parts;
  }

  private parseValue(raw: string): CellValue {
    const v = raw.trim();
    if (/^null$/i.test(v)) return null;
    if (
      v.length >= 2 &&
      ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))
    ) {
      const q = v[0];
      return v.slice(1, -1).split(q + q).join(q);
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return Number(v);
    return v;
  }

  private toJson(p: SqlParseResult): string {
    const objs = p.rows.map((row) => {
      const obj: Record<string, CellValue> = {};
      p.columns.forEach((col, i) => {
        obj[col] = row[i] ?? null;
      });
      return obj;
    });
    return JSON.stringify(objs, null, 2);
  }

  private toCsv(p: SqlParseResult): string {
    const lines = [p.columns.map((c) => this.csvCell(c)).join(',')];
    for (const row of p.rows) {
      lines.push(p.columns.map((_, i) => this.csvCell(row[i] ?? null)).join(','));
    }
    return lines.join('\r\n');
  }

  private csvCell(v: CellValue): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
