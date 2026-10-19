import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Seg = string | number;

interface Match {
  path: string;
  value: unknown;
}

type Step =
  | { type: 'child'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }
  | { type: 'recursive'; key?: string; wildcard?: boolean }
  | { type: 'slice'; start?: number; end?: number; step?: number }
  | { type: 'filter'; expr: string }
  | { type: 'union'; options: Step[] };

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function childPath(path: string, key: Seg): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function readName(expr: string, i: number): { name: string; next: number } {
  const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(expr.slice(i));
  if (!m) throw new Error(`Expected a name at position ${i}`);
  return { name: m[0], next: i + m[0].length };
}

function parseStepList(inner: string): Step[] {
  const t = inner.trim();
  if (t === '*') return [{ type: 'wildcard' }];
  if (t.startsWith('?(') && t.endsWith(')')) {
    return [{ type: 'filter', expr: t.slice(2, -1) }];
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return [{ type: 'child', key: t.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\') }];
  }
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    try {
      const key = JSON.parse(t);
      if (typeof key === 'string') return [{ type: 'child', key }];
    } catch {
      /* fall through */
    }
  }
  if (/^-?\d+$/.test(t)) return [{ type: 'index', index: parseInt(t, 10) }];
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => p === '' || /^-?\d+$/.test(p))) {
      const num = (s: string): number | undefined => (s === '' ? undefined : parseInt(s, 10));
      return [{ type: 'slice', start: num(parts[0]), end: num(parts[1]), step: parts[2] !== undefined ? num(parts[2]) : undefined }];
    }
  }
  if (t.includes(',')) {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of t) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    return [{ type: 'union', options: parts.flatMap((p) => parseStepList(p)) }];
  }
  throw new Error(`Cannot parse bracket expression [${inner}]`);
}

function parsePath(expr: string): Step[] {
  const steps: Step[] = [];
  const pushRecursive = (s: Step): void => {
    if (s.type === 'child') steps.push({ type: 'recursive', key: s.key });
    else if (s.type === 'wildcard') steps.push({ type: 'recursive', wildcard: true });
    else throw new Error('Only names and * are supported after ..');
  };
  let i = 0;
  if (expr[i] !== '$') throw new Error('Path must start with $');
  i++;
  while (i < expr.length) {
    if (expr.startsWith('..', i)) {
      i += 2;
      if (expr[i] === '*') {
        steps.push({ type: 'recursive', wildcard: true });
        i++;
      } else if (expr[i] === '[') {
        const close = findBracketClose(expr, i);
        const inner = expr.slice(i + 1, close);
        for (const s of parseStepList(inner)) {
          if (s.type === 'union') {
            for (const o of s.options) pushRecursive(o);
          } else {
            pushRecursive(s);
          }
        }
        i = close + 1;
      } else {
        const r = readName(expr, i);
        steps.push({ type: 'recursive', key: r.name });
        i = r.next;
      }
    } else if (expr[i] === '.') {
      i++;
      if (expr[i] === '*') {
        steps.push({ type: 'wildcard' });
        i++;
      } else {
        const r = readName(expr, i);
        steps.push({ type: 'child', key: r.name });
        i = r.next;
      }
    } else if (expr[i] === '[') {
      const close = findBracketClose(expr, i);
      const inner = expr.slice(i + 1, close);
      steps.push(...parseStepList(inner));
      i = close + 1;
    } else {
      throw new Error(`Unexpected character '${expr[i]}' at position ${i}`);
    }
  }
  return steps;
}

function findBracketClose(expr: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') {
      depth--;
      if (depth === 0 && c === ']') return i;
    }
  }
  throw new Error('Unclosed bracket in path expression');
}

class FilterParser {
  private pos = 0;
  constructor(
    private readonly expr: string,
    private readonly at: unknown,
    private readonly root: unknown,
  ) {}

  parse(): boolean {
    const v = this.parseOr();
    this.ws();
    if (this.pos < this.expr.length) throw new Error(`Unexpected '${this.expr[this.pos]}' at position ${this.pos}`);
    return v;
  }

  private ws(): void {
    while (this.pos < this.expr.length && /\s/.test(this.expr[this.pos])) this.pos++;
  }

  private match(s: string): boolean {
    if (this.expr.startsWith(s, this.pos)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }

  private parseOr(): boolean {
    let l = this.parseAnd();
    for (;;) {
      this.ws();
      if (!this.match('||')) return l;
      this.ws();
      const r = this.parseAnd();
      l = l || r;
    }
  }

  private parseAnd(): boolean {
    let l = this.parseUnary();
    for (;;) {
      this.ws();
      if (!this.match('&&')) return l;
      this.ws();
      const r = this.parseUnary();
      l = l && r;
    }
  }

  private parseUnary(): boolean {
    this.ws();
    if (this.match('!')) return !this.parseUnary();
    if (this.match('(')) {
      const v = this.parseOr();
      this.ws();
      if (!this.match(')')) throw new Error('Expected )');
      return v;
    }
    return this.parseComparison();
  }

  private parseComparison(): boolean {
    const left = this.parseOperand();
    this.ws();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (this.match(op)) {
        this.ws();
        const right = this.parseOperand();
        return compare(left, op, right);
      }
    }
    return truthy(left);
  }

  private parseOperand(): unknown {
    this.ws();
    if (this.match('@')) return this.parsePathFrom(this.at);
    if (this.match('$')) return this.parsePathFrom(this.root);
    const c = this.expr[this.pos];
    if (c === '"' || c === "'") return this.parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber();
    if (this.expr.startsWith('true', this.pos)) {
      this.pos += 4;
      return true;
    }
    if (this.expr.startsWith('false', this.pos)) {
      this.pos += 5;
      return false;
    }
    if (this.expr.startsWith('null', this.pos)) {
      this.pos += 4;
      return null;
    }
    throw new Error(`Unexpected '${c}' at position ${this.pos}`);
  }

  private parseString(): string {
    const q = this.expr[this.pos];
    let i = this.pos + 1;
    let out = '';
    while (i < this.expr.length && this.expr[i] !== q) {
      if (this.expr[i] === '\\' && i + 1 < this.expr.length) {
        out += this.expr[i + 1];
        i += 2;
      } else {
        out += this.expr[i];
        i++;
      }
    }
    if (this.expr[i] !== q) throw new Error('Unterminated string');
    this.pos = i + 1;
    return out;
  }

  private parseNumber(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.expr.slice(this.pos));
    if (!m) throw new Error(`Expected a number at position ${this.pos}`);
    this.pos += m[0].length;
    return parseFloat(m[0]);
  }

  private parsePathFrom(base: unknown): unknown {
    let cur = base;
    for (;;) {
      this.ws();
      if (this.match('.')) {
        const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.expr.slice(this.pos));
        if (!m) throw new Error(`Expected a name at position ${this.pos}`);
        this.pos += m[0].length;
        cur = isObj(cur) ? cur[m[0]] : undefined;
      } else if (this.expr[this.pos] === '[') {
        const close = findBracketClose(this.expr, this.pos);
        const inner = this.expr.slice(this.pos + 1, close).trim();
        this.pos = close + 1;
        if (/^-?\d+$/.test(inner)) {
          const idx = parseInt(inner, 10);
          cur = Array.isArray(cur) ? cur[idx < 0 ? cur.length + idx : idx] : undefined;
        } else if (inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2) {
          const k = inner.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
          cur = isObj(cur) ? cur[k] : undefined;
        } else if (inner.startsWith('"') && inner.endsWith('"')) {
          try {
            const k = JSON.parse(inner);
            cur = isObj(cur) ? cur[k] : undefined;
          } catch {
            cur = undefined;
          }
        } else {
          throw new Error(`Unsupported bracket [${inner}] in filter`);
        }
      } else break;
    }
    return cur;
  }
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

function compare(left: unknown, op: string, right: unknown): boolean {
  if (op === '==') return looseEqual(left, right);
  if (op === '!=') return !looseEqual(left, right);
  if (typeof left === 'number' && typeof right === 'number') {
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    return left >= right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    return left >= right;
  }
  return false;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '' && !isNaN(Number(b))) return a === Number(b);
  if (typeof b === 'number' && typeof a === 'string' && a.trim() !== '' && !isNaN(Number(a))) return Number(a) === b;
  return a === b;
}

function descendants(v: unknown, basePath: string): Match[] {
  const out: Match[] = [];
  const walk = (x: unknown, p: string): void => {
    out.push({ path: p, value: x });
    if (Array.isArray(x)) x.forEach((item, i) => walk(item, `${p}[${i}]`));
    else if (isObj(x)) for (const k of Object.keys(x)) walk(x[k], childPath(p, k));
  };
  walk(v, basePath);
  return out;
}

function applyStep(step: Step, nodes: Match[], root: unknown): Match[] {
  const out: Match[] = [];
  for (const n of nodes) {
    const v = n.value;
    switch (step.type) {
      case 'child':
        if (isObj(v) && step.key in v) out.push({ path: childPath(n.path, step.key), value: v[step.key] });
        break;
      case 'index': {
        if (Array.isArray(v)) {
          const idx = step.index < 0 ? v.length + step.index : step.index;
          if (idx >= 0 && idx < v.length) out.push({ path: `${n.path}[${idx}]`, value: v[idx] });
        }
        break;
      }
      case 'wildcard':
        if (Array.isArray(v)) v.forEach((item, i) => out.push({ path: `${n.path}[${i}]`, value: item }));
        else if (isObj(v)) for (const k of Object.keys(v)) out.push({ path: childPath(n.path, k), value: v[k] });
        break;
      case 'recursive': {
        const all = descendants(v, n.path);
        if (step.wildcard) {
          for (const d of all) {
            if (d.path !== n.path) out.push(d);
          }
        } else if (step.key !== undefined) {
          for (const d of all) {
            if (isObj(d.value) && step.key in d.value) {
              out.push({ path: childPath(d.path, step.key), value: (d.value as Record<string, unknown>)[step.key] });
            }
          }
        }
        break;
      }
      case 'slice': {
        if (Array.isArray(v)) {
          const len = v.length;
          const stepN = step.step ?? 1;
          if (stepN === 0) break;
          const norm = (x: number | undefined, dflt: number): number => {
            if (x === undefined) return dflt;
            const y = x < 0 ? len + x : x;
            return Math.min(len, Math.max(0, y));
          };
          const s = norm(step.start, stepN > 0 ? 0 : len - 1);
          const e = norm(step.end, stepN > 0 ? len : -1);
          if (stepN > 0) {
            for (let i = s; i < e; i += stepN) out.push({ path: `${n.path}[${i}]`, value: v[i] });
          } else {
            for (let i = s; i > e; i += stepN) out.push({ path: `${n.path}[${i}]`, value: v[i] });
          }
        }
        break;
      }
      case 'filter': {
        const items: { value: unknown; path: string }[] = [];
        if (Array.isArray(v)) v.forEach((item, i) => items.push({ value: item, path: `${n.path}[${i}]` }));
        else if (isObj(v)) for (const k of Object.keys(v)) items.push({ value: v[k], path: childPath(n.path, k) });
        for (const item of items) {
          try {
            if (new FilterParser(step.expr, item.value, root).parse()) {
              out.push({ path: item.path, value: item.value });
            }
          } catch {
            /* treat filter errors as non-match */
          }
        }
        break;
      }
      case 'union': {
        for (const opt of step.options) {
          out.push(...applyStep(opt, [n], root));
        }
        break;
      }
    }
  }
  return out;
}

const SAMPLE_DOC = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "price": 8.99 },
      { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

const SAMPLE_EXPRS = [
  '$.store.book[*].author',
  '$..price',
  '$.store.book[?(@.price < 10)].title',
  '$.store.book[-1].title',
];

@Component({
  selector: 'app-jsonpath-tester',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './jsonpath-tester.component.html',
  styleUrl: './jsonpath-tester.component.scss',
})
export class JsonpathTesterComponent implements OnDestroy {
  readonly slug = 'jsonpath-tester';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-viewer', 'json-formatter'];
  readonly sampleExprs = SAMPLE_EXPRS;

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly docText = signal(SAMPLE_DOC);
  readonly expr = signal('$.store.book[?(@.price < 10)].title');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const text = this.docText();
    let doc: unknown;
    try {
      doc = text.trim() ? JSON.parse(text) : undefined;
    } catch (e) {
      return { matches: [] as Match[], jsonError: e instanceof Error ? e.message : 'Invalid JSON', exprError: null as string | null };
    }
    if (doc === undefined) {
      return { matches: [] as Match[], jsonError: null as string | null, exprError: null as string | null };
    }
    try {
      const steps = parsePath(this.expr().trim());
      let current: Match[] = [{ path: '$', value: doc }];
      for (const s of steps) current = applyStep(s, current, doc);
      return { matches: current, jsonError: null as string | null, exprError: null as string | null };
    } catch (e) {
      return { matches: [] as Match[], jsonError: null as string | null, exprError: e instanceof Error ? e.message : 'Bad expression' };
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

  fmtVal(v: unknown): string {
    const s = JSON.stringify(v) ?? String(v);
    return s.length > 120 ? s.slice(0, 117) + '...' : s;
  }

  setDoc(v: string): void {
    this.docText.set(v);
  }

  setExpr(v: string): void {
    this.expr.set(v);
  }

  useSample(e: string): void {
    this.expr.set(e);
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
