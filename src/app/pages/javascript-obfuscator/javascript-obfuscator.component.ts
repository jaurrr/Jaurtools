import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Span {
  start: number;
  end: number;
  kind: 'string' | 'lineComment' | 'blockComment';
}

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'enum', 'await', 'implements', 'interface',
  'package', 'private', 'protected', 'public', 'static', 'null', 'true', 'false', 'undefined',
  'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Promise', 'Symbol', 'BigInt', 'Date', 'RegExp', 'Error', 'Map', 'Set',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'alert',
  'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'parseInt',
  'parseFloat', 'isNaN', 'encodeURI', 'decodeURI', 'require', 'module', 'exports', 'arguments',
]);

function scanSpans(src: string): Span[] {
  const spans: Span[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = i;
      i++;
      while (i < n) {
        const d = src[i];
        if (d === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && d === '$' && src[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            const e = src[i];
            if (e === '\\') {
              i += 2;
              continue;
            }
            if (e === '{') depth++;
            else if (e === '}') depth--;
            i++;
          }
          continue;
        }
        if (d === quote) {
          i++;
          break;
        }
        i++;
      }
      spans.push({ start, end: i, kind: 'string' });
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      spans.push({ start, end: i, kind: 'lineComment' });
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      spans.push({ start, end: i, kind: 'blockComment' });
      continue;
    }
    i++;
  }
  return spans;
}

function hexEscapeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp <= 0xff) return '\\x' + cp.toString(16).padStart(2, '0');
  if (cp <= 0xffff) return '\\u' + cp.toString(16).padStart(4, '0');
  return '\\u{' + cp.toString(16) + '}';
}

function escapeInner(inner: string, isTemplate: boolean): string {
  const chars = Array.from(inner);
  if (!isTemplate) return chars.map(hexEscapeChar).join('');
  let out = '';
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === '$' && chars[i + 1] === '{') {
      let depth = 1;
      let k = i + 2;
      while (k < chars.length && depth > 0) {
        if (chars[k] === '{') depth++;
        else if (chars[k] === '}') depth--;
        k++;
      }
      out += chars.slice(i, k).join('');
      i = k;
    } else {
      out += hexEscapeChar(chars[i]);
      i++;
    }
  }
  return out;
}

function escapeLiteral(lit: string): string {
  const q = lit[0];
  const closed = lit.length >= 2 && lit[lit.length - 1] === q;
  const inner = closed ? lit.slice(1, -1) : lit.slice(1);
  return q + escapeInner(inner, q === '`') + (closed ? q : '');
}

function obfuscateJs(
  src: string,
  opts: { rename: boolean; escape: boolean; strip: boolean },
): { code: string; renamed: number } {
  const spans = scanSpans(src);
  const literals: string[] = [];
  const PH = '\u0001';
  let masked = '';
  let last = 0;
  for (const s of spans) {
    masked += src.slice(last, s.start);
    if (s.kind === 'string') {
      literals.push(src.slice(s.start, s.end));
      masked += PH + (literals.length - 1) + PH;
    } else if (opts.strip) {
      masked += s.kind === 'lineComment' ? '\n' : ' ';
    } else {
      masked += src.slice(s.start, s.end);
    }
    last = s.end;
  }
  masked += src.slice(last);

  let code = masked;
  let renamed = 0;
  if (opts.rename) {
    const declRe = /\b(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/g;
    const names: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(code)) !== null) {
      if (!RESERVED.has(m[1]) && !seen.has(m[1])) {
        seen.add(m[1]);
        names.push(m[1]);
      }
    }
    if (names.length > 0) {
      const map = new Map<string, string>();
      names.forEach((nm, idx) => map.set(nm, `_0x${idx.toString(36)}`));
      const re = new RegExp(`(?<![.\\w$])(?:${names.join('|')})(?![\\w$])`, 'g');
      code = code.replace(re, (w) => map.get(w) ?? w);
      renamed = names.length;
    }
  }
  code = code.replace(/[ \t\u00a0]{2,}/g, ' ');
  const phRe = new RegExp(`${PH}(\\d+)${PH}`, 'g');
  code = code.replace(phRe, (_, k: string) => {
    const lit = literals[Number(k)];
    return opts.escape ? escapeLiteral(lit) : lit;
  });
  return { code: code.replace(/^\s+|\s+$/g, ''), renamed };
}

const SAMPLE = `// Calculate the total price with tax
function calculateTotal(price, taxRate) {
  const tax = price * taxRate;
  const total = price + tax;
  return total;
}
const message = "Your total is: ";
console.log(message + calculateTotal(100, 0.08));`;

@Component({
  selector: 'app-javascript-obfuscator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './javascript-obfuscator.component.html',
  styleUrl: './javascript-obfuscator.component.scss',
})
export class JavascriptObfuscatorComponent implements OnDestroy {
  readonly slug = 'javascript-obfuscator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-formatter', 'json-validator', 'jwt-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly source = signal(SAMPLE);
  readonly renameIds = signal(true);
  readonly escapeStrings = signal(true);
  readonly stripComments = signal(true);
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

  readonly result = computed(() => {
    const src = this.source();
    if (!src.trim()) return { code: '', renamed: 0, orig: 0, obf: 0, ratio: 0 };
    const out = obfuscateJs(src, {
      rename: this.renameIds(),
      escape: this.escapeStrings(),
      strip: this.stripComments(),
    });
    const enc = new TextEncoder();
    const orig = enc.encode(src).length;
    const obf = enc.encode(out.code).length;
    return {
      code: out.code,
      renamed: out.renamed,
      orig,
      obf,
      ratio: orig === 0 ? 0 : Math.round((obf / orig) * 100),
    };
  });

  readonly hasModuleSyntax = computed(() => /\b(import|export)\b/.test(this.source()));

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

  fmtBytes(n: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  setSource(v: string): void {
    this.source.set(v);
  }

  async copyOutput(): Promise<void> {
    const code = this.result().code;
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
    const code = this.result().code;
    if (!code) return;
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'obfuscated.js';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  loadSample(): void {
    this.source.set(SAMPLE);
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
