import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CurlHeader { name: string; value: string; }
interface CurlFormField { name: string; value: string; isFile: boolean; }
interface ParsedCurl {
  method: string;
  url: string;
  headers: CurlHeader[];
  body: string;
  bodyIsJson: boolean;
  form: CurlFormField[];
  user: string;
  insecure: boolean;
  timeoutMs: number | null;
  userAgent: string;
  referer: string;
  cookies: string[];
  unsupported: string[];
}

const VALUE_FLAGS: Record<string, string> = {
  '-X': 'method', '--request': 'method',
  '-H': 'header', '--header': 'header',
  '-d': 'data', '--data': 'data', '--data-raw': 'data', '--data-binary': 'data', '--data-ascii': 'data',
  '--data-urlencode': 'dataUrlencode', '--json': 'json',
  '-F': 'form', '--form': 'form', '--form-string': 'formString',
  '-u': 'user', '--user': 'user',
  '-A': 'userAgent', '--user-agent': 'userAgent',
  '-e': 'referer', '--referer': 'referer',
  '-b': 'cookie', '--cookie': 'cookie',
  '-m': 'maxTime', '--max-time': 'maxTime',
  '--url': 'urlValue', '--connect-timeout': 'connectTimeout',
};

const BOOL_FLAGS = new Set([
  '-k', '--insecure', '--compressed', '-G', '--get',
  '-s', '--silent', '-S', '--show-error', '-v', '--verbose',
  '-i', '--include', '-L', '--location', '-O', '--remote-name',
  '-N', '--no-buffer', '-f', '--fail', '-#', '--progress-bar',
  '-0', '--http1.0', '--http1.1', '--http2', '--http3',
  '-l', '--list-only', '-I', '--head', '--path-as-is',
]);

const DEFAULT_INPUT = `curl -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Asha","age":28}'`;

@Component({
  selector: 'app-curl-fetch-axios-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './curl-fetch-axios-converter.component.html',
  styleUrl: './curl-fetch-axios-converter.component.scss',
})
export class CurlFetchAxiosConverterComponent implements OnDestroy {
  readonly slug = 'curl-fetch-axios-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['hash-generator', 'hmac-generator', 'html-entities-encoder-decoder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(DEFAULT_INPUT);
  readonly outputTab = signal<'fetch' | 'axios'>('fetch');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed<ParsedCurl | null>(() => this.parseCurl(this.input()));

  readonly fetchCode = computed(() => {
    const p = this.parsed();
    return p ? this.buildFetch(p) : '';
  });

  readonly axiosCode = computed(() => {
    const p = this.parsed();
    return p ? this.buildAxios(p) : '';
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

  setInput(v: string) { this.input.set(v); }
  setOutputTab(v: 'fetch' | 'axios') { this.outputTab.set(v); }

  copyText(text: string) {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  loadSample(): void {
    this.input.set(DEFAULT_INPUT);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private tokenize(raw: string): string[] {
    const src = raw.replace(/\\\r?\n/g, ' ');
    const tokens: string[] = [];
    let cur = '';
    let quote: string | null = null;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\' && i + 1 < src.length) { cur += src[i + 1]; i++; }
        else if (ch === quote) { quote = null; }
        else { cur += ch; }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '\\' && i + 1 < src.length) {
        cur += src[i + 1]; i++;
      } else if (/\s/.test(ch)) {
        if (cur.length > 0) { tokens.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0) tokens.push(cur);
    return tokens;
  }

  private parseCurl(raw: string): ParsedCurl | null {
    const tokens = this.tokenize(raw);
    if (tokens.length === 0) return null;
    let i = tokens[0] === 'curl' ? 1 : 0;

    const p: ParsedCurl = {
      method: 'GET', url: '', headers: [], body: '', bodyIsJson: false,
      form: [], user: '', insecure: false, timeoutMs: null,
      userAgent: '', referer: '', cookies: [], unsupported: [],
    };
    const bodyParts: string[] = [];
    let useGet = false;

    const takeValue = (): string => {
      i++;
      return i < tokens.length ? tokens[i] : '';
    };

    const applyFlag = (kind: string, value: string) => {
      switch (kind) {
        case 'method': p.method = value.toUpperCase(); break;
        case 'header': {
          const idx = value.indexOf(':');
          if (idx > 0) p.headers.push({ name: value.slice(0, idx).trim(), value: value.slice(idx + 1).trim() });
          break;
        }
        case 'data': bodyParts.push(value); break;
        case 'dataUrlencode': {
          const eq = value.indexOf('=');
          bodyParts.push(eq >= 0
            ? `${encodeURIComponent(value.slice(0, eq))}=${encodeURIComponent(value.slice(eq + 1))}`
            : encodeURIComponent(value));
          break;
        }
        case 'json':
          bodyParts.push(value);
          if (!p.headers.some((h) => h.name.toLowerCase() === 'content-type')) {
            p.headers.push({ name: 'Content-Type', value: 'application/json' });
            p.headers.push({ name: 'Accept', value: 'application/json' });
          }
          break;
        case 'form': case 'formString': {
          const eq = value.indexOf('=');
          if (eq > 0) {
            const v = value.slice(eq + 1);
            p.form.push({ name: value.slice(0, eq), value: kind === 'form' && v.startsWith('@') ? v.slice(1) : v, isFile: kind === 'form' && v.startsWith('@') });
          }
          break;
        }
        case 'user': p.user = value; break;
        case 'userAgent': p.userAgent = value; break;
        case 'referer': p.referer = value; break;
        case 'cookie': p.cookies.push(value); break;
        case 'maxTime': case 'connectTimeout': {
          const s = parseFloat(value);
          if (Number.isFinite(s) && s > 0) p.timeoutMs = Math.round(s * 1000);
          break;
        }
        case 'urlValue': p.url = value; break;
      }
    };

    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '--') { i++; continue; }
      if (tok.startsWith('--')) {
        const eq = tok.indexOf('=');
        const name = eq >= 0 ? tok.slice(0, eq) : tok;
        if (VALUE_FLAGS[name]) {
          applyFlag(VALUE_FLAGS[name], eq >= 0 ? tok.slice(eq + 1) : takeValue());
        } else if (BOOL_FLAGS.has(name)) {
          if (name === '-k' || name === '--insecure') p.insecure = true;
          if (name === '-G' || name === '--get') useGet = true;
        } else if (!p.unsupported.includes(name)) {
          p.unsupported.push(name);
        }
      } else if (tok.startsWith('-') && tok.length > 1) {
        if (VALUE_FLAGS[tok]) {
          applyFlag(VALUE_FLAGS[tok], takeValue());
        } else {
          const second = '-' + tok[1];
          if (VALUE_FLAGS[second]) {
            applyFlag(VALUE_FLAGS[second], tok.length > 2 ? tok.slice(2) : takeValue());
          } else {
            for (let c = 1; c < tok.length; c++) {
              const f = '-' + tok[c];
              if (BOOL_FLAGS.has(f)) {
                if (f === '-k') p.insecure = true;
                if (f === '-G') useGet = true;
              } else if (!p.unsupported.includes(f)) {
                p.unsupported.push(f);
              }
            }
          }
        }
      } else if (p.url === '') {
        p.url = tok;
      }
      i++;
    }

    if (p.url === '') return null;
    p.body = bodyParts.join('&');
    if (p.body === '' && p.method === 'GET' && bodyParts.length === 0) {
      p.method = 'GET';
    } else if (p.body !== '' && p.method === 'GET' && !useGet) {
      p.method = 'POST';
    }
    if (useGet && p.body !== '') {
      p.url += (p.url.includes('?') ? '&' : '?') + p.body;
      p.body = '';
    }
    const trimmed = p.body.trim();
    p.bodyIsJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    return p;
  }

  private jsStr(v: string): string {
    return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  }

  private prettyJson(body: string, indent: string): string | null {
    try {
      const obj = JSON.parse(body);
      const lines = JSON.stringify(obj, null, 2).split('\n');
      return lines
        .map((l, idx) => {
          if (idx === 0) return l;
          const level = Math.round((l.match(/^ */)?.[0].length ?? 0) / 2);
          return indent + '  '.repeat(level) + l.trim();
        })
        .join('\n');
    } catch {
      return null;
    }
  }

  private headerLines(p: ParsedCurl, indent: string): string[] {
    const lines: string[] = [];
    for (const h of p.headers) lines.push(`${indent}${this.jsStr(h.name)}: ${this.jsStr(h.value)},`);
    if (p.userAgent) lines.push(`${indent}// Note: browsers block the User-Agent header; it only works in Node.js`);
    if (p.referer) lines.push(`${indent}// Note: browsers block the Referer header; it only works in Node.js`);
    if (p.cookies.length > 0) lines.push(`${indent}// Note: browsers block the Cookie header; cookies are managed by the browser`);
    return lines;
  }

  private buildFetch(p: ParsedCurl): string {
    const out: string[] = [];
    if (p.insecure) out.push('// Note: curl --insecure has no fetch equivalent; browsers always validate TLS certificates.');
    const hasOptions = p.method !== 'GET' || p.headers.length > 0 || p.body !== '' || p.form.length > 0 || p.timeoutMs !== null || p.user !== '';
    if (!hasOptions) {
      out.push(`const response = await fetch(${this.jsStr(p.url)});`, '', 'const data = await response.json();', 'console.log(data);');
      return out.join('\n');
    }
    out.push(`const response = await fetch(${this.jsStr(p.url)}, {`);
    if (p.method !== 'GET') out.push(`  method: ${this.jsStr(p.method)},`);
    const headers = this.headerLines(p, '    ');
    if (headers.length > 0 || p.user) {
      out.push('  headers: {');
      out.push(...headers);
      if (p.user) {
        const cut = p.user.indexOf(':');
        const u = cut >= 0 ? p.user.slice(0, cut) : p.user;
        const pw = cut >= 0 ? p.user.slice(cut + 1) : '';
        out.push(`    'Authorization': 'Basic ' + btoa(${this.jsStr(u)} + ':' + ${this.jsStr(pw)}),`);
      }
      out.push('  },');
    }
    if (p.form.length > 0) {
      out.push('  body: (() => {');
      out.push('    const formData = new FormData();');
      for (const f of p.form) {
        out.push(f.isFile
          ? `    formData.append(${this.jsStr(f.name)}, /* File: ${f.value} */ document.querySelector('input[type=file]').files[0]);`
          : `    formData.append(${this.jsStr(f.name)}, ${this.jsStr(f.value)});`);
      }
      out.push('    return formData;', '  })(),');
    } else if (p.body !== '') {
      const pretty = p.bodyIsJson ? this.prettyJson(p.body, '  ') : null;
      out.push(pretty ? `  body: JSON.stringify(${pretty}),` : `  body: ${this.jsStr(p.body)},`);
    }
    if (p.timeoutMs !== null) out.push(`  signal: AbortSignal.timeout(${p.timeoutMs}),`);
    out.push('});', '', 'const data = await response.json();', 'console.log(data);');
    return out.join('\n');
  }

  private buildAxios(p: ParsedCurl): string {
    const out: string[] = [];
    if (p.insecure) out.push('// Note: curl --insecure has no axios equivalent in browsers; TLS is always validated.');
    if (p.form.length > 0) {
      out.push('const formData = new FormData();');
      for (const f of p.form) {
        out.push(f.isFile
          ? `formData.append(${this.jsStr(f.name)}, /* File: ${f.value} */ document.querySelector('input[type=file]').files[0]);`
          : `formData.append(${this.jsStr(f.name)}, ${this.jsStr(f.value)});`);
      }
      out.push('');
    }
    out.push('const response = await axios({');
    out.push(`  method: ${this.jsStr(p.method.toLowerCase())},`);
    out.push(`  url: ${this.jsStr(p.url)},`);
    const headers = this.headerLines(p, '    ');
    if (headers.length > 0) {
      out.push('  headers: {');
      out.push(...headers);
      out.push('  },');
    }
    if (p.user) {
      const cut = p.user.indexOf(':');
      out.push(`  auth: { username: ${this.jsStr(cut >= 0 ? p.user.slice(0, cut) : p.user)}, password: ${this.jsStr(cut >= 0 ? p.user.slice(cut + 1) : '')} },`);
    }
    if (p.form.length > 0) {
      out.push('  data: formData,');
    } else if (p.body !== '') {
      const pretty = p.bodyIsJson ? this.prettyJson(p.body, '  ') : null;
      out.push(pretty ? `  data: ${pretty},` : `  data: ${this.jsStr(p.body)},`);
    }
    if (p.timeoutMs !== null) out.push(`  timeout: ${p.timeoutMs},`);
    out.push('});', '', 'console.log(response.data);');
    return out.join('\n');
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
