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

function safeProp(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function tsPrimitive(v: unknown): string {
  switch (typeof v) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    default: return 'unknown';
  }
}

interface TsIface {
  name: string;
  props: { type: string; name: string }[];
}

function generateTypeScript(
  value: unknown,
  rootName: string,
  opts: { exported: boolean; optional: boolean },
): string {
  const ifaces: TsIface[] = [];
  const usedNames = new Set<string>();

  function uniqueName(base: string): string {
    let name = pascalCase(base);
    let i = 2;
    while (usedNames.has(name)) name = pascalCase(base) + i++;
    usedNames.add(name);
    return name;
  }

  function typeOf(v: unknown, key: string): string {
    if (v === null) return 'null';
    if (v === undefined) return 'unknown';
    if (Array.isArray(v)) {
      if (v.length === 0) return 'unknown[]';
      const inner = v.map((item) => typeOf(item, key));
      const uniq = [...new Set(inner)];
      const itemType = uniq.length === 1 ? uniq[0] : `(${uniq.join(' | ')})`;
      return `${itemType}[]`;
    }
    if (typeof v === 'object') return ifaceFor(v as Record<string, unknown>, key);
    return tsPrimitive(v);
  }

  function ifaceFor(obj: Record<string, unknown>, key: string): string {
    const name = uniqueName(key);
    const iface: TsIface = { name, props: [] };
    ifaces.push(iface);
    for (const [k, v] of Object.entries(obj)) {
      iface.props.push({ type: typeOf(v, k), name: safeProp(k) });
    }
    return name;
  }

  const rootType = typeOf(value, rootName);
  const exp = opts.exported ? 'export ' : '';
  const opt = opts.optional ? '?' : '';
  const lines: string[] = [];
  if (!ifaces.length) {
    lines.push(`${exp}type ${pascalCase(rootName)} = ${rootType};`);
    lines.push('');
    return lines.join('\n');
  }
  for (const iface of ifaces) {
    lines.push(`${exp}interface ${iface.name} {`);
    for (const p of iface.props) {
      lines.push(`  ${p.name}${opt}: ${p.type};`);
    }
    lines.push('}');
    lines.push('');
  }
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
  selector: 'app-json-typescript',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-typescript.component.html',
  styleUrl: './json-typescript.component.scss',
})
export class JsonTypescriptComponent implements OnDestroy {
  readonly slug = 'json-typescript';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-c', 'json-formatter', 'json-to-xml'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE);
  readonly ifaceName = signal('Root');
  readonly exported = signal(true);
  readonly optional = signal(false);
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
      const root = this.ifaceName().trim() || 'Root';
      const code = generateTypeScript(value, root, { exported: this.exported(), optional: this.optional() });
      return { code, error: null as string | null };
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

  setIfaceName(v: string): void {
    this.ifaceName.set(v);
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
    a.download = `${this.ifaceName().trim() || 'Root'}.ts`;
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
