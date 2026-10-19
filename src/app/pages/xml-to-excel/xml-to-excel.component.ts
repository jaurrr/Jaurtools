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
  selector: 'app-xml-to-excel',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './xml-to-excel.component.html',
  styleUrl: './xml-to-excel.component.scss',
})
export class XmlToExcelComponent implements OnDestroy {
  readonly slug = 'xml-to-excel';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['xml-to-csv', 'split-files', 'sql-to-json'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly xmlText = signal('');
  readonly includeHeader = signal(true);
  readonly fileError = signal('');

  private blobUrls: string[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed<XmlParseResult>(() => this.parseXml(this.xmlText()));

  readonly xls = computed(() => {
    const p = this.parsed();
    if (!p.ok) return '';
    return this.buildXls(p);
  });

  readonly previewRows = computed(() => this.parsed().rows.slice(0, 5));

  readonly cellCount = computed(() => {
    const p = this.parsed();
    if (!p.ok) return 0;
    return p.rows.length * p.columns.length + (this.includeHeader() ? p.columns.length : 0);
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

  download() {
    const out = this.xls();
    if (!out) return;
    const blob = new Blob([out], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'data.xls';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy() {
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
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

  private buildXls(p: XmlParseResult): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isNum = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '';
    const cell = (v: string) =>
      `<Cell><Data ss:Type="${isNum(v) ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
    let rows = '';
    if (this.includeHeader()) {
      rows += `<Row>${p.columns.map((c) => cell(c)).join('')}</Row>`;
    }
    for (const r of p.rows) {
      rows += `<Row>${r.map((c) => cell(c)).join('')}</Row>`;
    }
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
      `<Worksheet ss:Name="Sheet1"><Table>${rows}</Table></Worksheet>\n` +
      `</Workbook>`
    );
  }

  private localName(tag: string): string {
    const i = tag.indexOf(':');
    return i >= 0 ? tag.slice(i + 1) : tag;
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
