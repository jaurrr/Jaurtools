import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Seg = string | number;

interface DupInfo {
  key: string;
  path: string;
  line: number;
}

interface Check {
  id: 'parse' | 'duplicates' | 'trailing' | 'comments' | 'bom';
  ok: boolean;
  detail: string | null;
}

interface Ctx {
  kind: 'obj' | 'arr';
  keys: Map<string, number>;
  key: Seg;
  index: number;
}

function scanStructure(text: string): { dups: DupInfo[]; hasTrailingComma: boolean; hasComment: boolean } {
  const dups: DupInfo[] = [];
  const stack: Ctx[] = [];
  let pendingKey: string | null = null;
  let hasTrailingComma = false;
  let hasComment = false;
  const n = text.length;
  let i = 0;
  const pathOf = (): string =>
    '$' +
    stack
      .map((c) => (typeof c.key === 'number' ? `[${c.key}]` : c.key === '' ? '' : `.${c.key}`))
      .join('');

  while (i < n) {
    const c = text[i];
    const parent = stack.length > 0 ? stack[stack.length - 1] : null;

    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      let keyVal: string;
      try {
        keyVal = JSON.parse(text.slice(start, i));
      } catch {
        keyVal = '';
      }
      let j = i;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === ':' && parent && parent.kind === 'obj') {
        const line = text.slice(0, start).split('\n').length;
        if (parent.keys.has(keyVal)) dups.push({ key: keyVal, path: pathOf(), line });
        else parent.keys.set(keyVal, line);
        pendingKey = keyVal;
        i = j + 1;
      } else {
        if (parent && parent.kind === 'arr') parent.index++;
        pendingKey = null;
      }
      continue;
    }

    if (c === '{' || c === '[') {
      let key: Seg = '';
      if (parent) {
        if (parent.kind === 'arr') key = parent.index++;
        else if (pendingKey !== null) {
          key = pendingKey;
          pendingKey = null;
        }
      }
      stack.push({ kind: c === '{' ? 'obj' : 'arr', keys: new Map(), key, index: 0 });
      i++;
      continue;
    }

    if (c === '}' || c === ']') {
      stack.pop();
      pendingKey = null;
      i++;
      continue;
    }

    if (c === ',') {
      pendingKey = null;
      let j = i + 1;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') hasTrailingComma = true;
      i++;
      continue;
    }

    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      hasComment = true;
      if (text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++;
      } else {
        i += 2;
        while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i = Math.min(n, i + 2);
      }
      continue;
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      if (parent && parent.kind === 'arr') parent.index++;
      i++;
      while (i < n && /[0-9eE+.-]/.test(text[i])) i++;
      pendingKey = null;
      continue;
    }
    if (text.startsWith('true', i)) {
      if (parent && parent.kind === 'arr') parent.index++;
      pendingKey = null;
      i += 4;
      continue;
    }
    if (text.startsWith('false', i)) {
      if (parent && parent.kind === 'arr') parent.index++;
      pendingKey = null;
      i += 5;
      continue;
    }
    if (text.startsWith('null', i)) {
      if (parent && parent.kind === 'arr') parent.index++;
      pendingKey = null;
      i += 4;
      continue;
    }
    i++;
  }
  return { dups, hasTrailingComma, hasComment };
}

function errorPosition(text: string, message: string): { line: number; col: number } | null {
  const m = /at position (\d+)/.exec(message);
  if (!m) return null;
  const pos = Math.min(Number(m[1]), text.length);
  const before = text.slice(0, pos);
  return { line: before.split('\n').length, col: pos - before.lastIndexOf('\n') };
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function walkStats(v: unknown, depth: number, acc: { keys: number; depth: number }): void {
  acc.depth = Math.max(acc.depth, depth);
  if (Array.isArray(v)) {
    for (const item of v) walkStats(item, depth + 1, acc);
  } else if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v);
    acc.keys += entries.length;
    for (const [, val] of entries) walkStats(val, depth + 1, acc);
  }
}

const SAMPLE_VALID = `{
  "name": "Asha Sharma",
  "age": 30,
  "active": true,
  "tags": ["admin", "editor"]
}`;

const SAMPLE_INVALID = `{
  // user record - comments are not allowed in JSON
  "name": "Asha",
  "name": "Asha Sharma",
  "age": 30,
}`;

@Component({
  selector: 'app-json-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-validator.component.html',
  styleUrl: './json-validator.component.scss',
})
export class JsonValidatorComponent implements OnDestroy {
  readonly slug = 'json-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-formatter', 'json-schema-validator', 'json-diff'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE_VALID);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly analysis = computed(() => {
    const text = this.input();
    if (!text.trim()) {
      return { empty: true, error: null as string | null, line: 0, col: 0, dups: [] as DupInfo[], hasTrailingComma: false, hasComment: false, bom: false, value: undefined as unknown };
    }
    let value: unknown;
    let error: string | null = null;
    let line = 0;
    let col = 0;
    try {
      value = JSON.parse(text);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Invalid JSON';
      const pos = errorPosition(text, error);
      line = pos?.line ?? 0;
      col = pos?.col ?? 0;
    }
    const struct = scanStructure(text);
    return {
      empty: false,
      error,
      line,
      col,
      dups: struct.dups,
      hasTrailingComma: struct.hasTrailingComma,
      hasComment: struct.hasComment,
      bom: text.charCodeAt(0) === 0xfeff,
      value,
    };
  });

  readonly checks = computed<Check[]>(() => {
    const a = this.analysis();
    if (a.empty) return [];
    return [
      { id: 'parse', ok: !a.error, detail: a.error },
      {
        id: 'duplicates',
        ok: a.dups.length === 0,
        detail: a.dups.length > 0 ? String(a.dups.length) : null,
      },
      { id: 'trailing', ok: !a.hasTrailingComma, detail: null },
      { id: 'comments', ok: !a.hasComment, detail: null },
      { id: 'bom', ok: !a.bom, detail: null },
    ];
  });

  readonly stats = computed(() => {
    const a = this.analysis();
    if (a.empty || a.error) return null;
    const acc = { keys: 0, depth: 0 };
    walkStats(a.value, 1, acc);
    return {
      bytes: new TextEncoder().encode(this.input()).length,
      keys: acc.keys,
      depth: acc.depth,
      type: typeOf(a.value),
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

  dupMessage(d: DupInfo): string {
    return this.t('labels.dupMessage')
      .split('{key}').join(d.key)
      .split('{path}').join(d.path)
      .split('{line}').join(String(d.line));
  }

  fmt(n: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  setInput(v: string): void {
    this.input.set(v);
  }

  loadValid(): void {
    this.input.set(SAMPLE_VALID);
  }

  loadInvalid(): void {
    this.input.set(SAMPLE_INVALID);
  }

  loadSample(): void {
    this.input.set(SAMPLE_VALID);
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
