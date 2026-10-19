import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type CodeLang = 'js' | 'css' | 'html';
type IndentOpt = '2' | '4' | 'tab';
interface Tok {
  type: 'code' | 'str' | 'comment';
  text: string;
}

@Component({
  selector: 'app-code-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './code-formatter.component.html',
  styleUrl: './code-formatter.component.scss',
})
export class CodeFormatterComponent implements OnDestroy {
  readonly slug = 'code-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['code-minifier', 'css-inliner', 'css-box-shadow-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<CodeLang>('js');
  readonly indentOpt = signal<IndentOpt>('2');
  readonly input = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  private readonly samples: Record<CodeLang, string> = {
    js: 'function greet(name){if(name){return "Hello, "+name;}return "Hello!";}\nconst total=items.reduce((sum,item)=>sum+item.price,0);',
    css: '.card{color:#333;background:#fff;border:1px solid #ddd}.card h2{font-size:1.5rem;margin:0 0 .5rem}',
    html: '<div class="box"><h1>Title</h1><p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul></div>',
  };

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly indentStr = computed(() => {
    const o = this.indentOpt();
    return o === 'tab' ? '\t' : o === '4' ? '    ' : '  ';
  });

  readonly formatResult = computed(() => {
    const src = this.input();
    if (!src.trim()) {
      return { ok: true, text: '' };
    }
    const ind = this.indentStr();
    try {
      const text =
        this.lang() === 'js'
          ? this.formatJs(src, ind)
          : this.lang() === 'css'
            ? this.formatCss(src, ind)
            : this.formatHtml(src, ind);
      return { ok: true, text };
    } catch {
      return { ok: false, text: src };
    }
  });

  readonly output = computed(() => this.formatResult().text);
  readonly formatOk = computed(() => this.formatResult().ok);
  readonly inChars = computed(() => this.input().length);
  readonly inLines = computed(() => (this.input() ? this.input().split('\n').length : 0));
  readonly outChars = computed(() => this.output().length);
  readonly outLines = computed(() => (this.output() ? this.output().split('\n').length : 0));

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

  setIndent(v: string): void {
    if (v === '2' || v === '4' || v === 'tab') {
      this.indentOpt.set(v);
    }
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
    a.download = `formatted.${ext}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- JavaScript ----------

  private formatJs(src: string, ind: string): string {
    const tokens = this.tokenizeJs(src);
    const store: string[] = [];
    const masked = tokens
      .map((tk) => {
        if (tk.type === 'code') {
          return tk.text.replace(/\n/g, ' ');
        }
        store.push(tk.text);
        const ph = `%%S${store.length - 1}%%`;
        return tk.type === 'comment' ? `\n${ph}\n` : ph;
      })
      .join('');
    const formatted = this.formatJsCode(masked, ind);
    return formatted.replace(/%%S(\d+)%%/g, (_m, k: string) => store[Number(k)]);
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

  private formatJsCode(code: string, ind: string): string {
    const src = code.replace(/[ \t]+/g, ' ');
    let out = '';
    let depth = 0;
    let paren = 0;
    let i = 0;
    const n = src.length;
    const trimEnd = () => {
      out = out.replace(/[ \t]+$/, '');
    };
    const peekWord = (pos: number): string => {
      let j = pos;
      while (j < n && (src[j] === ' ' || src[j] === '\n')) {
        j++;
      }
      const m = /^[_$a-zA-Z][\w$]*/.exec(src.slice(j, j + 24));
      return m ? m[0] : '';
    };
    const peekChar = (pos: number): string => {
      let j = pos;
      while (j < n && (src[j] === ' ' || src[j] === '\n')) {
        j++;
      }
      return src[j] ?? '';
    };
    while (i < n) {
      const c = src[i];
      if (c === '\n') {
        // Newlines here only ever come from comment boundaries (code newlines
        // were collapsed before formatting), so honour them as line breaks.
        out = out.replace(/[ \t]+$/, '');
        if (!out.endsWith('\n')) {
          out += '\n';
        }
        out = out.replace(/\n[ \t]*$/, '\n' + ind.repeat(depth));
        i++;
        continue;
      }
      if (c === ' ') {
        const last = out.slice(-1);
        if (last !== '' && last !== ' ' && last !== '\n') {
          out += ' ';
        }
        i++;
        continue;
      }
      if (c === '{') {
        trimEnd();
        depth++;
        out += ' {\n' + ind.repeat(depth);
        i++;
        continue;
      }
      if (c === '}') {
        depth = Math.max(0, depth - 1);
        trimEnd();
        if (!out.endsWith('\n')) {
          out += '\n' + ind.repeat(depth);
        } else {
          out = out.replace(/\n[ \t]*$/, '\n' + ind.repeat(depth));
        }
        out += '}';
        const w = peekWord(i + 1);
        const nc = peekChar(i + 1);
        if (w === 'else' || w === 'catch' || w === 'finally' || w === 'while') {
          out += ' ';
        } else if (nc !== '' && !';,)]\'.'.includes(nc)) {
          out += '\n' + ind.repeat(depth);
        }
        i++;
        continue;
      }
      if (c === ';') {
        trimEnd();
        out += ';';
        out += paren === 0 ? '\n' + ind.repeat(depth) : ' ';
        i++;
        continue;
      }
      if (c === '(') {
        if (/[\w$)\]]/.test(out.slice(-1))) {
          trimEnd();
        }
        paren++;
        out += '(';
        i++;
        continue;
      }
      if (c === ')') {
        paren = Math.max(0, paren - 1);
        trimEnd();
        out += ')';
        i++;
        continue;
      }
      if (c === ',') {
        trimEnd();
        out += ', ';
        i++;
        continue;
      }
      out += c;
      i++;
    }
    out = out.replace(/\b(if|for|while|switch|catch|with|return|typeof|new|delete|void|throw|case|do|in|of)\(/g, '$1 (');
    return (
      out
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n')
        .trim() + '\n'
    );
  }

  // ---------- CSS ----------

  private formatCss(src: string, ind: string): string {
    const tokens = this.tokenizeCss(src);
    const store: string[] = [];
    const masked = tokens
      .map((tk) => {
        if (tk.type === 'code') {
          return tk.text.replace(/\s+/g, ' ');
        }
        store.push(tk.text);
        const ph = `%%S${store.length - 1}%%`;
        return tk.type === 'comment' ? `\n${ph}\n` : ph;
      })
      .join('');
    const formatted = this.formatCssCode(masked, ind);
    return formatted.replace(/%%S(\d+)%%/g, (_m, k: string) => store[Number(k)]);
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

  private formatCssCode(code: string, ind: string): string {
    const src = code.replace(/[ \t]+/g, ' ');
    let out = '';
    let depth = 0;
    let i = 0;
    const n = src.length;
    const trimEnd = () => {
      out = out.replace(/[ \t]+$/, '');
    };
    while (i < n) {
      const c = src[i];
      const nxt = src[i + 1] ?? '';
      if (c === '\n') {
        // Newlines here only ever come from comment boundaries.
        out = out.replace(/[ \t]+$/, '');
        if (!out.endsWith('\n')) {
          out += '\n';
        }
        out = out.replace(/\n[ \t]*$/, '\n' + ind.repeat(depth));
        i++;
        continue;
      }
      if (c === ' ') {
        const last = out.slice(-1);
        if (last !== '' && last !== ' ' && last !== '\n') {
          out += ' ';
        }
        i++;
        continue;
      }
      if (c === '{') {
        trimEnd();
        depth++;
        out += ' {\n' + ind.repeat(depth);
        i++;
        continue;
      }
      if (c === '}') {
        depth = Math.max(0, depth - 1);
        trimEnd();
        // Beautifiers terminate the last declaration: add a missing ';'
        // unless the block was empty or just closed a nested block.
        const lastCh = out.replace(/\s+$/, '').slice(-1);
        if (lastCh !== '' && lastCh !== '{' && lastCh !== ';' && lastCh !== '}') {
          out += ';';
        }
        if (!out.endsWith('\n')) {
          out += '\n';
        }
        out += ind.repeat(depth) + '}';
        let j = i + 1;
        while (j < n && src[j] === ' ') {
          j++;
        }
        const nc = src[j] ?? '';
        if (nc !== '' && nc !== '}') {
          out += '\n' + ind.repeat(depth);
        }
        i++;
        continue;
      }
      if (c === ';') {
        trimEnd();
        out += ';';
        let j = i + 1;
        while (j < n && src[j] === ' ') {
          j++;
        }
        if ((src[j] ?? '') !== '}') {
          out += '\n' + ind.repeat(depth);
        }
        i++;
        continue;
      }
      if (c === ':') {
        if (nxt === ':') {
          out += '::';
          i += 2;
          continue;
        }
        trimEnd();
        out += depth > 0 ? ': ' : ':';
        i++;
        continue;
      }
      if (c === ',') {
        trimEnd();
        out += depth === 0 ? ',\n' + ind.repeat(depth) : ', ';
        i++;
        continue;
      }
      if (c === ')') {
        trimEnd();
        out += ')';
        i++;
        continue;
      }
      out += c;
      i++;
    }
    return (
      out
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n')
        .trim() + '\n'
    );
  }

  // ---------- HTML ----------

  private formatHtml(src: string, ind: string): string {
    const raws: string[] = [];
    const s = src.replace(
      /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi,
      (_m, tag: string, attrs: string, inner: string) => {
        raws.push(inner);
        return `<${tag}${attrs ?? ''}>%%R${raws.length - 1}%%</${tag}>`;
      },
    );
    const tokens = this.tokenizeHtml(s);
    const voids = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]);
    const inline = new Set([
      'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code',
      'data', 'dfn', 'em', 'i', 'img', 'input', 'kbd', 'label', 'mark',
      'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
      'time', 'u', 'var', 'wbr', 'select', 'option', 'textarea',
    ]);
    const tagName = (tg: string): string => {
      const m = /^<\/?([a-zA-Z][\w-]*)/.exec(tg);
      return m ? m[1].toLowerCase() : '';
    };
    const isClose = (tg: string) => tg.startsWith('</');
    const isSelfClose = (tg: string) => /\/\s*>$/.test(tg);
    const isInlineOpen = (tg: string) =>
      !isClose(tg) && !isSelfClose(tg) && inline.has(tagName(tg)) && !voids.has(tagName(tg));
    let out = '';
    let depth = 0;
    // True when the last emitted content was text or an inline tag, so a
    // block-level closing tag can stay on the same line (e.g. <h1>Title</h1>).
    let lastWasText = false;
    const nl = () => {
      out = out.replace(/[ \t]+$/, '');
      out += '\n' + ind.repeat(depth);
    };
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      if (tok.type === 'text') {
        const raw = tok.text.replace(/\s+/g, ' ');
        const trimmed = raw.trim();
        if (trimmed) {
          out = out.replace(/[ \t]+$/, '');
          const prevTok = k > 0 ? tokens[k - 1] : null;
          const afterInlineClose =
            prevTok !== null &&
            prevTok.type === 'tag' &&
            isClose(prevTok.text) &&
            inline.has(tagName(prevTok.text));
          if (
            out !== '' &&
            !out.endsWith('\n') &&
            (!out.endsWith('>') || (afterInlineClose && /^\s/.test(raw)))
          ) {
            out += ' ';
          }
          out += trimmed;
          const nxtTok = tokens[k + 1];
          if (raw.endsWith(' ') && nxtTok && nxtTok.type === 'tag' && isInlineOpen(nxtTok.text)) {
            out += ' ';
          }
          lastWasText = true;
        }
        continue;
      }
      const tg = tok.text;
      if (tg.startsWith('<!--') || /^<!doctype/i.test(tg)) {
        nl();
        out += tg;
        lastWasText = false;
        continue;
      }
      const name = tagName(tg);
      if (isClose(tg)) {
        depth = Math.max(0, depth - 1);
        const isInlineClose = inline.has(name) && !voids.has(name);
        if (isInlineClose || lastWasText) {
          out = out.replace(/[ \t]+$/, '');
          out += tg;
        } else {
          nl();
          out += tg;
        }
        lastWasText = isInlineClose;
        continue;
      }
      if (isSelfClose(tg) || voids.has(name)) {
        if (inline.has(name)) {
          if (!lastWasText) {
            nl();
          }
          out += tg;
          lastWasText = true;
        } else {
          nl();
          out += tg;
          lastWasText = false;
        }
        continue;
      }
      if (inline.has(name)) {
        if (!lastWasText) {
          nl();
        }
        out += tg;
        lastWasText = true;
        continue;
      }
      nl();
      out += tg;
      depth++;
      lastWasText = false;
    }
    const restored = out.replace(/%%R(\d+)%%/g, (_m, kk: string) => raws[Number(kk)]);
    return restored.trim() + '\n';
  }

  private tokenizeHtml(src: string): { type: 'tag' | 'text'; text: string }[] {
    const tokens: { type: 'tag' | 'text'; text: string }[] = [];
    const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z][^>]*>/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) {
        tokens.push({ type: 'text', text: src.slice(last, m.index) });
      }
      tokens.push({ type: 'tag', text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < src.length) {
      tokens.push({ type: 'text', text: src.slice(last) });
    }
    return tokens;
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
