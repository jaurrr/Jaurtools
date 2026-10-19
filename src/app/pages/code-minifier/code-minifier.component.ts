import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CodeLang = 'js' | 'css' | 'html';
interface Tok {
  type: 'code' | 'str' | 'comment';
  text: string;
}

@Component({
  selector: 'app-code-minifier',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './code-minifier.component.html',
  styleUrl: './code-minifier.component.scss',
})
export class CodeMinifierComponent implements OnDestroy {
  readonly slug = 'code-minifier';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['code-formatter', 'css-inliner', 'chmod-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<CodeLang>('js');
  readonly input = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  private readonly samples: Record<CodeLang, string> = {
    js: 'function greet(name) {\n  if (name) {\n    return "Hello, " + name;\n  }\n  return "Hello!";\n}',
    css: '.card {\n  color: #333;\n  background: #fff;\n  border: 1px solid #ddd;\n}',
    html: '<div class="box">\n  <h1>Title</h1>\n  <!-- a comment -->\n  <p>Hello <strong>world</strong></p>\n</div>',
  };

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly minifyResult = computed(() => {
    const src = this.input();
    if (!src.trim()) {
      return { ok: true, text: '' };
    }
    try {
      const text =
        this.lang() === 'js'
          ? this.minifyJs(src)
          : this.lang() === 'css'
            ? this.minifyCss(src)
            : this.minifyHtml(src);
      return { ok: true, text };
    } catch {
      return { ok: false, text: src };
    }
  });

  readonly output = computed(() => this.minifyResult().text);
  readonly minifyOk = computed(() => this.minifyResult().ok);
  readonly inChars = computed(() => this.input().length);
  readonly outChars = computed(() => this.output().length);
  readonly savings = computed(() => {
    const i = this.inChars();
    const o = this.outChars();
    if (i === 0) {
      return 0;
    }
    return Math.max(0, Math.round((1 - o / i) * 100));
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

  setLang(l: CodeLang): void {
    this.lang.set(l);
  }

  setInput(v: string): void {
    this.input.set(v ?? '');
  }

  loadSample(): void {
    this.input.set(this.samples[this.lang()]);
  }

  clear(): void {
    this.input.set('');
  }

  copy(): void {
    const text = this.output();
    if (!text) {
      return;
    }
    const done = () => {
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
    } catch {
      // clipboard unavailable; user can copy manually
    }
    this.document.body.removeChild(ta);
    done();
  }

  download(): void {
    const text = this.output();
    if (!text) {
      return;
    }
    const ext = this.lang() === 'js' ? 'js' : this.lang() === 'css' ? 'css' : 'html';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `minified.${ext}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- JavaScript ----------

  private minifyJs(src: string): string {
    const tokens = this.tokenizeJs(src);
    const store: string[] = [];
    const parts: string[] = [];
    for (const tk of tokens) {
      if (tk.type === 'comment') {
        // A newline can never join two identifiers and keeps ASI behaviour
        // identical to the commented source (e.g. a/*c*/++b stays a; ++b).
        parts.push('\n');
        continue;
      }
      if (tk.type === 'str') {
        store.push(tk.text);
        parts.push(`%%S${store.length - 1}%%`);
        continue;
      }
      parts.push(this.shrinkJsCode(tk.text));
    }
    // Newlines are only dropped where it is provably safe: around
    // punctuation, never between two operands (ASI hazards like x\n(y)).
    const s = parts
      .join('')
      .replace(/ *\n */g, '\n')
      .replace(/\n([{};\],:])/g, '$1')
      .replace(/([{;,:])\n/g, '$1')
      .replace(/}\n(?![(\[])/g, '}')
      .replace(/\n{2,}/g, '\n')
      .trim();
    return s.replace(/%%S(\d+)%%/g, (_m, k: string) => store[Number(k)]);
  }

  private shrinkJsCode(code: string): string {
    let c = code.replace(/[ \t]+/g, ' ');
    c = c.replace(/ ([{}();,:\[\]])/g, '$1').replace(/([{}();,:\[\]]) /g, '$1');
    return c;
  }

  private tokenizeJs(src: string): Tok[] {
    const tokens: Tok[] = [];
    let buf = '';
    let i = 0;
    const n = src.length;
    const pushCode = () => {
      if (buf) {
        tokens.push({ type: 'code', text: buf });
        buf = '';
      }
    };
    while (i < n) {
      const c = src[i];
      const nxt = src[i + 1] ?? '';
      if (c === '/' && nxt === '/') {
        pushCode();
        let j = i + 2;
        while (j < n && src[j] !== '\n') {
          j++;
        }
        tokens.push({ type: 'comment', text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '/' && nxt === '*') {
        pushCode();
        let j = i + 2;
        while (j < n - 1 && !(src[j] === '*' && src[j + 1] === '/')) {
          j++;
        }
        j = Math.min(n, j + 2);
        tokens.push({ type: 'comment', text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        pushCode();
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === c) {
            j++;
            break;
          }
          j++;
        }
        tokens.push({ type: 'str', text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '`') {
        pushCode();
        let j = i + 1;
        let depth = 0;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === '`' && depth === 0) {
            j++;
            break;
          }
          if (src[j] === '$' && src[j + 1] === '{') {
            depth++;
            j += 2;
            continue;
          }
          if (src[j] === '}' && depth > 0) {
            depth--;
            j++;
            continue;
          }
          j++;
        }
        tokens.push({ type: 'str', text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '/' && this.isRegexStart(buf)) {
        pushCode();
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const ch = src[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '[') {
            inClass = true;
          } else if (ch === ']') {
            inClass = false;
          } else if (ch === '/' && !inClass) {
            j++;
            break;
          } else if (ch === '\n') {
            break;
          }
          j++;
        }
        while (j < n && /[a-z]/i.test(src[j])) {
          j++;
        }
        tokens.push({ type: 'str', text: src.slice(i, j) });
        i = j;
        continue;
      }
      buf += c;
      i++;
    }
    pushCode();
    return tokens;
  }

  private isRegexStart(codeBefore: string): boolean {
    const t = codeBefore.replace(/\s+$/, '');
    if (!t) {
      return true;
    }
    const last = t[t.length - 1];
    if ('=(:,[!&|?{;'.includes(last)) {
      return true;
    }
    const m = /[_$a-zA-Z][\w$]*$/.exec(t);
    if (
      m &&
      ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'do', 'else', 'yield', 'await'].includes(m[0])
    ) {
      return true;
    }
    return false;
  }

  // ---------- CSS ----------

  private minifyCss(src: string): string {
    const tokens = this.tokenizeCss(src);
    const parts: string[] = [];
    for (const tk of tokens) {
      if (tk.type === 'comment') {
        continue;
      }
      if (tk.type === 'str') {
        parts.push(tk.text);
        continue;
      }
      let code = tk.text.replace(/\s+/g, ' ');
      code = code.replace(/\s*([{}:;,])\s*/g, '$1');
      code = code.replace(/\(\s*/g, '(').replace(/\s*\)/g, ')');
      parts.push(code);
    }
    return parts.join('').replace(/;}/g, '}').trim();
  }

  private tokenizeCss(src: string): Tok[] {
    const tokens: Tok[] = [];
    let buf = '';
    let i = 0;
    const n = src.length;
    const pushCode = () => {
      if (buf) {
        tokens.push({ type: 'code', text: buf });
        buf = '';
      }
    };
    while (i < n) {
      const c = src[i];
      const nxt = src[i + 1] ?? '';
      if (c === '/' && nxt === '*') {
        pushCode();
        let j = i + 2;
        while (j < n - 1 && !(src[j] === '*' && src[j + 1] === '/')) {
          j++;
        }
        j = Math.min(n, j + 2);
        tokens.push({ type: 'comment', text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        pushCode();
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === c) {
            j++;
            break;
          }
          j++;
        }
        tokens.push({ type: 'str', text: src.slice(i, j) });
        i = j;
        continue;
      }
      buf += c;
      i++;
    }
    pushCode();
    return tokens;
  }

  // ---------- HTML ----------

  private minifyHtml(src: string): string {
    const raws: string[] = [];
    // Block-level raw content: surrounding whitespace is insignificant.
    let s = src.replace(
      /<(pre|script|style)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi,
      (_m, tag: string, attrs: string, inner: string) => {
        raws.push(`<${tag}${attrs ?? ''}>${inner}</${tag}>`);
        return `%%B${raws.length - 1}%%`;
      },
    );
    // textarea keeps its surrounding spacing (it flows inline).
    s = s.replace(
      /<(textarea)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi,
      (_m, tag: string, attrs: string, inner: string) => {
        raws.push(`<${tag}${attrs ?? ''}>${inner}</${tag}>`);
        return `%%R${raws.length - 1}%%`;
      },
    );
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/>\s*%%B(\d+)%%\s*</g, '>%%B$1%%<');
    s = s.replace(/>\s+</g, '><');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/%%B(\d+)%%/g, (_m, k: string) => raws[Number(k)]);
    return s.replace(/%%R(\d+)%%/g, (_m, k: string) => raws[Number(k)]);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
