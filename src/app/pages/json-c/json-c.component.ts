import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

function pascalCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter((p) => p.length > 0);
  let out = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  if (!out) out = 'Item';
  if (/^[0-9]/.test(out)) out = '_' + out;
  return out;
}

function isDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s);
}

function csPrimitive(v: unknown): string {
  if (typeof v === 'string') return isDateString(v) ? 'DateTime' : 'string';
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return 'double';
    return Math.abs(v) > 2147483647 ? 'long' : 'int';
  }
  if (typeof v === 'boolean') return 'bool';
  return 'object';
}

interface CsClass {
  name: string;
  props: { type: string; name: string }[];
}

function generateCSharp(value: unknown, rootName: string, namespace: string): string {
  const classes: CsClass[] = [];
  const usedNames = new Set<string>();

  function uniqueName(base: string): string {
    let name = pascalCase(base);
    let i = 2;
    while (usedNames.has(name)) name = pascalCase(base) + i++;
    usedNames.add(name);
    return name;
  }

  function typeOf(v: unknown, key: string): string {
    if (v === null || v === undefined) return 'object';
    if (Array.isArray(v)) {
      if (v.length === 0) return 'List<object>';
      const inner = v.map((item) => typeOf(item, key));
      const first = inner[0];
      return `List<${inner.every((x) => x === first) ? first : 'object'}>`;
    }
    if (typeof v === 'object') return classFor(v as Record<string, unknown>, key);
    return csPrimitive(v);
  }

  function classFor(obj: Record<string, unknown>, key: string): string {
    const name = uniqueName(key);
    const cls: CsClass = { name, props: [] };
    classes.push(cls);
    for (const [k, v] of Object.entries(obj)) {
      cls.props.push({ type: typeOf(v, k), name: pascalCase(k) });
    }
    return name;
  }

  const rootType = typeOf(value, rootName);
  const lines: string[] = [];
  lines.push('using System;');
  lines.push('using System.Collections.Generic;');
  lines.push('');
  const indent = namespace.trim() ? '    ' : '';
  if (namespace.trim()) {
    lines.push(`namespace ${namespace.trim()}`);
    lines.push('{');
  }
  if (rootType.startsWith('List<') || !classes.length) {
    lines.push(`${indent}public class ${pascalCase(rootName)}`);
    lines.push(`${indent}{`);
    lines.push(`${indent}    public ${rootType} Items { get; set; }`);
    lines.push(`${indent}}`);
  }
  for (const cls of classes) {
    lines.push(`${indent}public class ${cls.name}`);
    lines.push(`${indent}{`);
    for (const p of cls.props) {
      lines.push(`${indent}    public ${p.type} ${p.name} { get; set; }`);
    }
    lines.push(`${indent}}`);
    lines.push('');
  }
  if (namespace.trim()) lines.push('}');
  return lines.join('\n').replace(/\n+$/, '\n');
}

const SAMPLE = `{
  "id": 101,
  "name": "Asha Sharma",
  "isActive": true,
  "balance": 1250.75,
  "createdAt": "2026-10-01T10:30:00Z",
  "tags": ["admin", "editor"],
  "address": { "city": "Pune", "zip": "411001" },
  "scores": [10, 20, 30]
}`;

@Component({
  selector: 'app-json-c',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-c.component.html',
  styleUrl: './json-c.component.scss',
})
export class JsonCComponent implements OnDestroy {
  readonly slug = 'json-c';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-typescript', 'json-formatter', 'json-to-xml'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE);
  readonly className = signal('Root');
  readonly namespace = signal('');
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

  readonly output = computed(() => {
    const text = this.input();
    if (!text.trim()) return { code: '', error: null as string | null };
    try {
      const value = JSON.parse(text);
      const root = this.className().trim() || 'Root';
      return { code: generateCSharp(value, root, this.namespace()), error: null as string | null };
    } catch (e) {
      return { code: '', error: e instanceof Error ? e.message : 'Invalid JSON' };
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

  setInput(v: string): void {
    this.input.set(v);
  }

  setClassName(v: string): void {
    this.className.set(v);
  }

  setNamespace(v: string): void {
    this.namespace.set(v);
  }

  async copyOutput(): Promise<void> {
    const code = this.output().code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = code;
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
    const code = this.output().code;
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${this.className().trim() || 'Root'}.cs`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  loadSample(): void {
    this.input.set(SAMPLE);
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
