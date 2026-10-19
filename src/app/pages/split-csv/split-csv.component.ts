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
  selector: 'app-split-csv',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './split-csv.component.html',
  styleUrl: './split-csv.component.scss',
})
export class SplitCsvComponent implements OnDestroy {
  readonly slug = 'split-csv';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['split-excel-workbook', 'csv-formatter', 'csv-to-json', 'join-files'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('');
  readonly fileBase = signal('data');
  readonly mode = signal<'rows' | 'parts'>('rows');
  readonly rowsPerFile = signal(1000);
  readonly partCount = signal(2);
  readonly repeatHeader = signal(true);
  readonly delimiter = signal<',' | ';' | 'tab' | 'pipe'>(',');
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

  readonly rows = computed(() => {
    const text = this.inputText();
    if (!text.trim()) return [] as string[][];
    return parseCsv(text, detectDelimiter(text));
  });

  readonly dataRowCount = computed(() =>
    this.repeatHeader() ? Math.max(0, this.rows().length - 1) : this.rows().length
  );

  readonly plan = computed((): { chunks: number[][]; partRows: number[] } => {
    const all = this.rows();
    if (!all.length) return { chunks: [], partRows: [] };
    const data = this.repeatHeader() ? all.slice(1) : all;
    if (!data.length) return { chunks: [], partRows: [] };
    let sizes: number[];
    if (this.mode() === 'rows') {
      const per = Math.max(1, this.rowsPerFile());
      sizes = [];
      for (let i = 0; i < data.length; i += per) sizes.push(Math.min(per, data.length - i));
    } else {
      const n = Math.min(Math.max(2, this.partCount()), data.length);
      const base = Math.floor(data.length / n);
      const extra = data.length % n;
      sizes = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
    }
    const chunks: number[][] = [];
    let off = 0;
    for (const s of sizes) {
      chunks.push(data.slice(off, off + s).map((_, i) => off + i));
      off += s;
    }
    return { chunks, partRows: sizes };
  });

  readonly partCountPlanned = computed(() => this.plan().chunks.length);

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
  setFileBase(v: string): void {
    this.fileBase.set(v.slice(0, 60));
  }
  setMode(m: 'rows' | 'parts'): void {
    this.mode.set(m);
  }
  setRowsPerFile(v: number): void {
    if (!Number.isFinite(v)) v = 1;
    this.rowsPerFile.set(Math.min(1000000, Math.max(1, Math.floor(v))));
  }
  setPartCount(v: number): void {
    if (!Number.isFinite(v)) v = 2;
    this.partCount.set(Math.min(999, Math.max(2, Math.floor(v))));
  }
  setDelimiter(v: ',' | ';' | 'tab' | 'pipe'): void {
    this.delimiter.set(v);
  }
  toggleHeader(): void {
    this.repeatHeader.set(!this.repeatHeader());
  }
  loadSample(): void {
    const lines = ['name,age,city'];
    for (let i = 1; i <= 10; i++) lines.push(`Person ${i},${20 + i},City ${i}`);
    this.inputText.set(lines.join('\n'));
  }
  clear(): void {
    this.inputText.set('');
    this.doneInfo.set('');
    this.error.set('');
  }
  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.fileBase.set(f.name.replace(/\.csv$/i, '') || 'data');
    const reader = new FileReader();
    reader.onload = () => this.inputText.set(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  async split(): Promise<void> {
    const plan = this.plan();
    if (!plan.chunks.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.doneInfo.set('');
    try {
      const all = this.rows();
      const header = this.repeatHeader() ? all[0] : null;
      const data = this.repeatHeader() ? all.slice(1) : all;
      const delim =
        this.delimiter() === 'tab' ? '\t' : this.delimiter() === 'pipe' ? '|' : this.delimiter();
      const base = this.fileBase().trim().replace(/[\\/:*?"<>|]/g, '_') || 'data';
      let idx = 0;
      for (const chunk of plan.chunks) {
        idx++;
        const rows = chunk.map((i) => data[i]);
        const text = toCsv(header ? [header, ...rows] : rows, delim);
        downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${base}-part${idx}.csv`);
        await sleep(700);
      }
      this.doneInfo.set(this.t('labels.done').replace('{n}', String(plan.chunks.length)));
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
