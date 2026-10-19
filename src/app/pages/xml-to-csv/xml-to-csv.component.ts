import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface XmlParseResult {
  ok: boolean;
  error: string;
  recordTag: string;
  columns: string[];
  rows: string[][];
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE_XML = `<catalog>
  <book>
    <title>Atomic Habits</title>
    <author>James Clear</author>
    <price>499</price>
  </book>
  <book>
    <title>Deep Work</title>
    <author>Cal Newport</author>
    <price>450</price>
  </book>
</catalog>`;

@Component({
  selector: 'app-xml-to-csv',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './xml-to-csv.component.html',
  styleUrl: './xml-to-csv.component.scss',
})
export class XmlToCsvComponent implements OnDestroy {
  readonly slug = 'xml-to-csv';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['xml-to-excel', 'split-files', 'sql-to-json'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly xmlText = signal('');
  readonly includeHeader = signal(true);
  readonly copied = signal(false);
  readonly fileError = signal('');

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

  readonly parsed = computed<XmlParseResult>(() => this.parseXml(this.xmlText()));

  readonly csv = computed(() => {
    const p = this.parsed();
    if (!p.ok) return '';
    const lines: string[] = [];
    if (this.includeHeader()) lines.push(p.columns.map((c) => this.csvCell(c)).join(','));
    for (const row of p.rows) lines.push(row.map((c) => this.csvCell(c)).join(','));
    return '\uFEFF' + lines.join('\r\n');
  });

  readonly previewRows = computed(() => this.parsed().rows.slice(0, 5));

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

  setXmlText(v: string) {
    this.xmlText.set(v);
    this.fileError.set('');
  }
  setIncludeHeader(v: boolean) {
    this.includeHeader.set(v);
  }
  loadSample() {
    this.xmlText.set(SAMPLE_XML);
    this.fileError.set('');
  }
  clearAll() {
    this.xmlText.set('');
    this.copied.set(false);
    this.fileError.set('');
  }

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      this.fileError.set(this.t('labels.errorTooLarge'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.xmlText.set(String(reader.result ?? ''));
      this.fileError.set('');
    };
    reader.onerror = () => {
      this.fileError.set(this.t('labels.errorRead'));
    };
    reader.readAsText(f);
  }

  async copyOutput() {
    const out = this.csv();
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
    const out = this.csv();
    if (!out) return;
    const blob = new Blob([out], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'data.csv';
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

  private parseXml(text: string): XmlParseResult {
    const fail = (key: string): XmlParseResult => ({
      ok: false,
      error: this.t(`labels.${key}`),
      recordTag: '',
      columns: [],
      rows: [],
    });
    const empty: XmlParseResult = { ok: false, error: '', recordTag: '', columns: [], rows: [] };
    const trimmed = text.trim();
    if (!trimmed) return empty;

    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(trimmed, 'application/xml');
    } catch {
      return fail('errorInvalidXml');
    }
    if (doc.getElementsByTagName('parsererror').length > 0) return fail('errorInvalidXml');
    const root = doc.documentElement;
    if (!root) return fail('errorInvalidXml');

    const childTags = Array.from(root.children).map((c) => this.localName(c.tagName));
    const uniq = [...new Set(childTags)];
    let recordTag = '';
    if (uniq.length === 1 && childTags.length >= 2) {
      recordTag = childTags[0];
    } else {
      const counts = new Map<string, number>();
      const all = doc.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el === root) continue;
        const tag = this.localName(el.tagName);
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      let best = '';
      let bestN = 1;
      counts.forEach((n, tag) => {
        if (n > bestN) {
          bestN = n;
          best = tag;
        }
      });
      recordTag = best || (childTags.length === 1 ? childTags[0] : '');
    }
    if (!recordTag) return fail('errorNoRecords');

    const records: Element[] = [];
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (this.localName(all[i].tagName) === recordTag) records.push(all[i]);
    }
    if (records.length === 0) return fail('errorNoRecords');

    const columns: string[] = [];
    const colSet = new Set<string>();
    for (const rec of records) {
      for (const kid of Array.from(rec.children)) {
        if (kid.children.length > 0) continue;
        const tag = this.localName(kid.tagName);
        if (!colSet.has(tag)) {
          colSet.add(tag);
          columns.push(tag);
        }
      }
    }
    if (columns.length === 0) return fail('errorNoRecords');

    const rows = records.map((rec) =>
      columns.map((col) => {
        const kid = Array.from(rec.children).find(
          (k) => k.children.length === 0 && this.localName(k.tagName) === col
        );
        return kid ? (kid.textContent ?? '').trim() : '';
      })
    );
    return { ok: true, error: '', recordTag, columns, rows };
  }

  private localName(tag: string): string {
    const i = tag.indexOf(':');
    return i >= 0 ? tag.slice(i + 1) : tag;
  }

  private csvCell(v: string): string {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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
