import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Seg = string | number;
type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

interface TreeNode {
  pkey: string;
  path: Seg[];
  label: string;
  type: NodeType;
  display: string;
  children: TreeNode[] | null;
}

const AUTOSAVE_KEY = 'jt-json-viewer-input';

function nodeType(v: unknown): NodeType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'object' ? 'object' : t === 'string' ? 'string' : t === 'number' ? 'number' : 'boolean';
}

function makeNode(value: unknown, path: Seg[], label: string): TreeNode {
  const type = nodeType(value);
  const children = type === 'object' || type === 'array' ? buildNodes(value, path) : null;
  let display: string;
  if (type === 'object') display = `Object {${Object.keys(value as object).length}}`;
  else if (type === 'array') display = `Array(${(value as unknown[]).length})`;
  else {
    const raw = type === 'string' ? (value as string) : JSON.stringify(value) ?? 'null';
    const shown = type === 'string' ? `"${raw}"` : raw;
    display = shown.length > 60 ? shown.slice(0, 57) + '...' : shown;
  }
  return { pkey: JSON.stringify(path), path, label, type, display, children };
}

function buildNodes(value: unknown, path: Seg[]): TreeNode[] {
  const out: TreeNode[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(makeNode(item, [...path, i], `[${i}]`)));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(makeNode(v, [...path, k], k));
  }
  return out;
}

function jpath(path: Seg[]): string {
  return '$' + path.map((s) => (typeof s === 'number' ? `[${s}]` : `.${s}`)).join('');
}

function setAtPath(doc: unknown, path: Seg[], value: unknown): unknown {
  if (path.length === 0) return value;
  const clone = structuredClone(doc);
  let cur = clone as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
  cur[path[path.length - 1]] = value;
  return clone;
}

function removeAtPath(doc: unknown, path: Seg[]): unknown {
  if (path.length === 0) return null;
  const clone = structuredClone(doc);
  let cur = clone as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (Array.isArray(cur)) cur.splice(last as number, 1);
  else delete cur[last as string];
  return clone;
}

const SAMPLE = `{
  "store": {
    "name": "City Books",
    "open": true,
    "books": [
      { "title": "The Guide", "price": 299, "tags": ["classic", "travel"] },
      { "title": "Night Train", "price": 199, "tags": ["fiction"] }
    ],
    "address": { "city": "Jaipur", "zip": "302001" }
  }
}`;

@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgTemplateOutlet],
  templateUrl: './json-viewer.component.html',
  styleUrl: './json-viewer.component.scss',
})
export class JsonViewerComponent implements OnDestroy {
  readonly slug = 'json-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-viewer', 'json-formatter', 'jsonpath-tester'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal(SAMPLE);
  readonly doc = signal<unknown>(JSON.parse(SAMPLE));
  readonly expanded = signal<Set<string>>(new Set());
  readonly editing = signal<string | null>(null);
  readonly editValue = signal('');
  readonly editError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly copied = signal(false);
  readonly view = signal<'tree' | 'text'>('tree');
  readonly indent = signal<2 | 4>(2);
  readonly restored = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: number | null = null;
  private saveTimer: number | null = null;
  private parseTimer: number | null = null;

  constructor() {
    const saved = this.readSaved();
    if (saved !== null) {
      this.text.set(saved);
      this.restored.set(true);
    }
    this.load();
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    // Debounced autosave of the raw input.
    effect(() => {
      const v = this.text();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, v);
        } catch {
          /* storage full or unavailable — input still works */
        }
      }, 600);
    });
    // Debounced live parse: the tree follows the text as you type.
    effect(() => {
      const v = this.text();
      if (this.parseTimer !== null) window.clearTimeout(this.parseTimer);
      this.parseTimer = window.setTimeout(() => this.autoParse(v), 500);
    });
  }

  readonly rootNodes = computed<TreeNode[]>(() => {
    const d = this.doc();
    const t = nodeType(d);
    if (t === 'object' || t === 'array') return buildNodes(d, []);
    return [makeNode(d, [], '$')];
  });

  readonly formatted = computed(() => JSON.stringify(this.doc(), null, this.indent()) ?? '');

  readonly stats = computed(() => {
    let count = 0;
    let depth = 0;
    const walk = (nodes: TreeNode[], d: number) => {
      depth = Math.max(depth, d);
      for (const n of nodes) {
        count++;
        if (n.children) walk(n.children, d + 1);
      }
    };
    walk(this.rootNodes(), 1);
    return { count, depth };
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

  nodePath(n: TreeNode): string {
    return jpath(n.path);
  }

  isExpanded(pkey: string): boolean {
    return this.expanded().has(pkey);
  }

  toggleNode(pkey: string): void {
    const next = new Set(this.expanded());
    if (next.has(pkey)) next.delete(pkey);
    else next.add(pkey);
    this.expanded.set(next);
  }

  expandAll(): void {
    const next = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children) {
          next.add(n.pkey);
          walk(n.children);
        }
      }
    };
    walk(this.rootNodes());
    this.expanded.set(next);
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }

  setView(v: 'tree' | 'text'): void {
    this.view.set(v);
  }

  setIndent(v: 2 | 4): void {
    this.indent.set(v);
  }

  setText(v: string): void {
    this.text.set(v);
    this.restored.set(false);
  }

  loadSample(): void {
    this.text.set(SAMPLE);
    this.restored.set(false);
    this.load();
  }

  load(): void {
    try {
      const value = JSON.parse(this.text());
      this.doc.set(value);
      this.loadError.set(null);
      this.editing.set(null);
      this.expandAll();
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  onUpload(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === 'string' ? reader.result : '';
      this.text.set(v.slice(0, 500000));
      this.restored.set(false);
      this.load();
    };
    reader.readAsText(file);
    input.value = '';
  }

  startEdit(n: TreeNode): void {
    if (n.type === 'object' || n.type === 'array') return;
    const d = this.doc();
    let cur: unknown = d;
    for (const s of n.path) cur = (cur as Record<string | number, unknown>)[s];
    this.editValue.set(n.type === 'string' ? String(cur) : JSON.stringify(cur) ?? '');
    this.editing.set(n.pkey);
    this.editError.set(null);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.editError.set(null);
  }

  applyEdit(n: TreeNode): void {
    const raw = this.editValue();
    let value: unknown;
    if (n.type === 'string') {
      value = raw;
    } else {
      try {
        value = JSON.parse(raw);
      } catch {
        this.editError.set(this.t('labels.editErrorLabel'));
        return;
      }
    }
    this.doc.set(setAtPath(this.doc(), n.path, value));
    this.editing.set(null);
    this.editError.set(null);
  }

  deleteNode(n: TreeNode): void {
    this.cancelEdit();
    this.doc.set(removeAtPath(this.doc(), n.path));
  }

  async copyJson(): Promise<void> {
    const text = JSON.stringify(this.doc(), null, 2);
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = text;
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
  }

  download(): void {
    const blob = new Blob([JSON.stringify(this.doc(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'edited.json';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (this.parseTimer !== null) window.clearTimeout(this.parseTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private readSaved(): string | null {
    try {
      const v = localStorage.getItem(AUTOSAVE_KEY);
      return v && v.trim() ? v : null;
    } catch {
      return null;
    }
  }

  private autoParse(v: string): void {
    try {
      this.doc.set(JSON.parse(v));
      this.loadError.set(null);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Invalid JSON');
    }
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
