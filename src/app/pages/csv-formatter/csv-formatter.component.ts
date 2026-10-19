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

function formatCsv(rows: string[][], delim: string, trim: boolean, quoteAll: boolean): string {
  const out = rows.map((r) =>
    r
      .map((f) => {
        const v = trim ? f.trim() : f;
        const needs = quoteAll || v.includes('"') || v.includes('\n') || v.includes('\r') || v.includes(delim);
        return needs ? '"' + v.replace(/"/g, '""') + '"' : v;
      })
      .join(delim)
  );
  return out.join('\r\n');
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
  selector: 'app-csv-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './csv-formatter.component.html',
  styleUrl: './csv-formatter.component.scss',
})
export class CsvFormatterComponent implements OnDestroy {
  readonly slug = 'csv-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['csv-to-json', 'csv-to-excel', 'split-csv', 'json-to-csv'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly inputText = signal('');
  readonly delimiter = signal<'auto' | ',' | ';' | 'tab' | 'pipe'>('auto');
  readonly outDelimiter = signal<',' | ';' | 'tab' | 'pipe'>(',');
  readonly trimFields = signal(true);
  readonly removeBlank = signal(true);
  readonly quoteAll = signal(false);
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

  readonly resolvedIn = computed(() =>
    this.delimiter() === 'auto' ? detectDelimiter(this.inputText()) : DELIMS[this.delimiter()]
  );
  readonly resolvedOut = computed(() => DELIMS[this.outDelimiter()]);

  readonly rows = computed(() => {
    const text = this.inputText();
    if (!text.trim()) return [] as string[][];
    let rows = parseCsv(text, this.resolvedIn());
    if (this.removeBlank()) rows = rows.filter((r) => r.some((c) => c.trim() !== ''));
    const width = Math.max(0, ...rows.map((r) => r.length));
    return rows.map((r) => {
      const copy = [...r];
      while (copy.length < width) copy.push('');
      return copy;
    });
  });

  readonly output = computed(() =>
    formatCsv(this.rows(), this.resolvedOut(), this.trimFields(), this.quoteAll())
  );

  readonly stats = computed(() => {
    const rows = this.rows();
    return {
      rows: rows.length,
      cols: rows.length ? rows[0].length : 0,
      inChars: this.inputText().length,
      outChars: this.output().length,
    };
  });

  readonly preview = computed(() => this.rows().slice(0, 8));

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
  setOutDelimiter(v: ',' | ';' | 'tab' | 'pipe'): void {
    this.outDelimiter.set(v);
  }
  toggleTrim(): void {
    this.trimFields.set(!this.trimFields());
  }
  toggleBlank(): void {
    this.removeBlank.set(!this.removeBlank());
  }
  toggleQuoteAll(): void {
    this.quoteAll.set(!this.quoteAll());
  }
  loadSample(): void {
    this.inputText.set(
      'name; age; city\n"Aarav Sharma" ;25; Mumbai\n\nPriya Verma; 30 ;Delhi\n"Rohan, Jr.";22; Jaipur'
    );
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
    downloadBlob(new Blob([this.output()], { type: 'text/csv;charset=utf-8' }), 'formatted.csv');
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
