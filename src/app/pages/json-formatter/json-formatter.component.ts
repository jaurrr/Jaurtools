import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Stats {
  keys: number;
  depth: number;
}

function countStats(v: unknown, depth: number): Stats {
  if (Array.isArray(v)) {
    let keys = 0;
    let max = depth;
    for (const item of v) {
      const s = countStats(item, depth + 1);
      keys += s.keys;
      max = Math.max(max, s.depth);
    }
    return { keys, depth: max };
  }
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    let keys = entries.length;
    let max = depth;
    for (const [, val] of entries) {
      const s = countStats(val, depth + 1);
      keys += s.keys;
      max = Math.max(max, s.depth);
    }
    return { keys, depth: max };
  }
  return { keys: 0, depth };
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function errorPosition(text: string, message: string): { line: number; col: number } | null {
  const m = /at position (\d+)/.exec(message);
  if (!m) return null;
  const pos = Math.min(Number(m[1]), text.length);
  const before = text.slice(0, pos);
  return { line: before.split('\n').length, col: pos - before.lastIndexOf('\n') };
}

const SAMPLE = `{"name":"Asha Sharma","age":30,"active":true,"tags":["admin","editor"],"address":{"city":"Pune","zip":"411001"}}`;

@Component({
  selector: 'app-json-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-formatter.component.html',
  styleUrl: './json-formatter.component.scss',
})
export class JsonFormatterComponent implements OnDestroy {
  readonly slug = 'json-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-validator', 'json-viewer', 'json-diff'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE);
  readonly indent = signal<'2' | '4' | 'tab'>('2');
  readonly sortKeys = signal(false);
  readonly mode = signal<'pretty' | 'minify'>('pretty');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: number | null = null;

  readonly restored = signal(false);

  private saveTimer: number | null = null;

  constructor() {
    const saved = this.readSaved();
    if (saved !== null) {
      this.input.set(saved);
      this.restored.set(true);
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const v = this.input();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem('jt-json-formatter-input', v);
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 700);
    });
  }

  readonly parsed = computed(() => {
    const text = this.input();
    if (!text.trim()) return { value: undefined as unknown, error: null as string | null, line: 0, col: 0, empty: true };
    try {
      return { value: JSON.parse(text) as unknown, error: null as string | null, line: 0, col: 0, empty: false };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid JSON';
      const pos = errorPosition(text, message);
      return { value: undefined as unknown, error: message, line: pos?.line ?? 0, col: pos?.col ?? 0, empty: false };
    }
  });

  readonly output = computed(() => {
    const p = this.parsed();
    if (p.error || p.empty) return '';
    const v = this.sortKeys() ? sortKeysDeep(p.value) : p.value;
    if (this.mode() === 'minify') return JSON.stringify(v);
    const gap = this.indent() === 'tab' ? '\t' : this.indent() === '4' ? '    ' : '  ';
    return JSON.stringify(v, null, gap);
  });

  readonly stats = computed<Stats>(() => {
    const p = this.parsed();
    if (p.error || p.empty) return { keys: 0, depth: 0 };
    return countStats(p.value, 1);
  });

  readonly sizeBytes = computed(() => new TextEncoder().encode(this.input()).length);

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

  fmt(n: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  setInput(v: string): void {
    this.input.set(v);
  
    this.restored.set(false);
  }

  setIndent(v: '2' | '4' | 'tab'): void {
    this.indent.set(v);
  }

  format(): void {
    this.mode.set('pretty');
  }

  minify(): void {
    this.mode.set('minify');
  }

  async copyOutput(): Promise<void> {
    const code = this.output();
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
    const code = this.output();
    if (!code) return;
    const blob = new Blob([code], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = this.mode() === 'minify' ? 'minified.json' : 'formatted.json';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  loadSample(): void {
    this.input.set(SAMPLE);
    this.restored.set(false);
  }


  onUpload(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === 'string' ? reader.result : '';
      this.setInput(v.slice(0, 100000));
    };
    reader.readAsText(file);
    input.value = '';
  }

  ngOnDestroy() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }


  private readSaved(): string | null {
    try {
      const v = localStorage.getItem('jt-json-formatter-input');
      return v && v.trim() ? v.slice(0, 100000) : null;
    } catch {
      return null;
    }
  }
  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-IN';
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
