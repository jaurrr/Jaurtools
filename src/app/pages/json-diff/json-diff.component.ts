import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type DiffKind = 'added' | 'removed' | 'modified';

interface DiffRow {
  path: string;
  kind: DiffKind;
  oldVal: string;
  newVal: string;
}

interface DiffResult {
  leftError: string | null;
  rightError: string | null;
  rows: DiffRow[];
  truncated: boolean;
  added: number;
  removed: number;
  modified: number;
}

function fmtVal(v: unknown): string {
  if (v === undefined) return '—';
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 90 ? s.slice(0, 87) + '...' : s;
}

function displayPath(path: string): string {
  if (path === '') return '$';
  return path.startsWith('[') ? '$' + path : '$.' + path;
}

function diffRec(a: unknown, b: unknown, path: string, rows: DiffRow[]): void {
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  const aObj = a !== null && typeof a === 'object';
  const bObj = b !== null && typeof b === 'object';
  if (aArr && bArr) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`;
      if (i >= a.length) rows.push({ path: displayPath(p), kind: 'added', oldVal: '—', newVal: fmtVal(b[i]) });
      else if (i >= b.length) rows.push({ path: displayPath(p), kind: 'removed', oldVal: fmtVal(a[i]), newVal: '—' });
      else diffRec(a[i], b[i], p, rows);
    }
    return;
  }
  if (aObj && bObj && !aArr && !bArr) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in ao)) rows.push({ path: displayPath(p), kind: 'added', oldVal: '—', newVal: fmtVal(bo[k]) });
      else if (!(k in bo)) rows.push({ path: displayPath(p), kind: 'removed', oldVal: fmtVal(ao[k]), newVal: '—' });
      else diffRec(ao[k], bo[k], p, rows);
    }
    return;
  }
  if (!Object.is(a, b)) {
    rows.push({ path: displayPath(path), kind: 'modified', oldVal: fmtVal(a), newVal: fmtVal(b) });
  }
}

function parseJson(text: string): { value: unknown; error: string | null } {
  if (!text.trim()) return { value: undefined, error: null };
  try {
    return { value: JSON.parse(text), error: null };
  } catch (e) {
    return { value: undefined, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

const SAMPLE_LEFT = `{
  "name": "Asha",
  "age": 30,
  "tags": ["admin", "editor"],
  "address": { "city": "Pune" }
}`;

const SAMPLE_RIGHT = `{
  "name": "Asha",
  "age": 31,
  "tags": ["admin", "viewer", "owner"],
  "address": { "city": "Pune", "zip": "411001" },
  "active": true
}`;

@Component({
  selector: 'app-json-diff',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-diff.component.html',
  styleUrl: './json-diff.component.scss',
})
export class JsonDiffComponent implements OnDestroy {
  readonly slug = 'json-diff';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-formatter', 'json-validator', 'json-viewer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly left = signal(SAMPLE_LEFT);
  readonly right = signal(SAMPLE_RIGHT);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: number | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly diff = computed<DiffResult>(() => {
    const l = parseJson(this.left());
    const r = parseJson(this.right());
    if (l.error || r.error || l.value === undefined || r.value === undefined) {
      return { leftError: l.error, rightError: r.error, rows: [], truncated: false, added: 0, removed: 0, modified: 0 };
    }
    const rows: DiffRow[] = [];
    diffRec(l.value, r.value, '', rows);
    const LIMIT = 500;
    const truncated = rows.length > LIMIT;
    const shown = truncated ? rows.slice(0, LIMIT) : rows;
    return {
      leftError: null,
      rightError: null,
      rows: shown,
      truncated,
      added: rows.filter((x) => x.kind === 'added').length,
      removed: rows.filter((x) => x.kind === 'removed').length,
      modified: rows.filter((x) => x.kind === 'modified').length,
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

  setLeft(v: string): void {
    this.left.set(v);
  }

  setRight(v: string): void {
    this.right.set(v);
  }

  async copyDiff(): Promise<void> {
    const d = this.diff();
    if (d.rows.length === 0) return;
    const lines = d.rows.map((r) => `${r.kind.toUpperCase()} ${r.path}: ${r.oldVal} -> ${r.newVal}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n')).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = lines.join('\n');
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
  }

  loadSample(): void {
    this.left.set(SAMPLE_LEFT);
    this.right.set(SAMPLE_RIGHT);
  }

  ngOnDestroy() {
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
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
