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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
function validXmlName(s: string): boolean {
  return XML_NAME_RE.test(s);
}
function safeFieldName(s: string, i: number): string {
  let name = s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '');
  if (!/^[A-Za-z_]/.test(name)) name = 'field_' + name;
  if (name === '' || name === '_' ) name = `field${i + 1}`;
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
  selector: 'app-csv-to-xml',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './csv-to-xml.component.html',
  styleUrl: './csv-to-xml.component.scss',
})
export class CsvToXmlComponent implements OnDestroy {
  readonly slug = 'csv-to-xml';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['csv-to-json', 'excel-to-xml', 'json-xml-csv-converter', 'csv-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('');
  readonly delimiter = signal<'auto' | ',' | ';' | 'tab' | 'pipe'>('auto');
  readonly firstRowHeader = signal(true);
  readonly rootName = signal('rows');
  readonly rowName = signal('row');
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

  readonly rows = computed(() => {
    const text = this.inputText();
    if (!text.trim()) return [] as string[][];
    const delim = this.delimiter() === 'auto' ? detectDelimiter(text) : DELIMS[this.delimiter()];
    const rows = parseCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''));
    const width = Math.max(0, ...rows.map((r) => r.length));
    return rows.map((r) => {
      const copy = [...r];
      while (copy.length < width) copy.push('');
      return copy;
    });
  });

  readonly namesValid = computed(
    () => validXmlName(this.rootName().trim()) && validXmlName(this.rowName().trim())
  );

  readonly output = computed(() => {
    const rows = this.rows();
    if (!rows.length || !this.namesValid()) return '';
    const root = this.rootName().trim();
    const rowTag = this.rowName().trim();
    const nl = this.pretty() ? '\n' : '';
    const ind = this.pretty() ? '  ' : '';
    const ind2 = this.pretty() ? '    ' : '';
    const headers = this.firstRowHeader()
      ? rows[0].map((h, i) => safeFieldName(h, i))
      : rows[0].map((_, i) => `field${i + 1}`);
    const dataRows = this.firstRowHeader() ? rows.slice(1) : rows;
    const body = dataRows
      .map((r) => {
        const cells = r.map((c, i) => `${ind2}<${headers[i]}>${escXml(c)}</${headers[i]}>`).join(nl);
        return `${ind}<${rowTag}>${nl}${cells}${nl}${ind}</${rowTag}>`;
      })
      .join(nl);
    return `<?xml version="1.0" encoding="UTF-8"?>${nl}<${root}>${nl}${body}${nl}</${root}>`;
  });

  readonly stats = computed(() => ({
    records: this.firstRowHeader() ? Math.max(0, this.rows().length - 1) : this.rows().length,
    fields: this.rows().length ? this.rows()[0].length : 0,
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
  setRootName(v: string): void {
    this.rootName.set(v.slice(0, 40));
  }
  setRowName(v: string): void {
    this.rowName.set(v.slice(0, 40));
  }
  toggleHeader(): void {
    this.firstRowHeader.set(!this.firstRowHeader());
  }
  togglePretty(): void {
    this.pretty.set(!this.pretty());
  }
  loadSample(): void {
    this.inputText.set('name,age,city\nAarav Sharma,25,Mumbai\nPriya Verma,30,Delhi');
    this.delimiter.set('auto');
  }
  clear(): void {
    this.inputText.set('');
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
    downloadBlob(new Blob([this.output()], { type: 'application/xml;charset=utf-8' }), 'data.xml');
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
