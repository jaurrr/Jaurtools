import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Lang = 'javascript' | 'html' | 'css' | 'python' | 'json';

const RULES: Record<Lang, Array<[string, string]>> = {
  javascript: [
    ['\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*', 'tok-c'],
    ['`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'', 'tok-s'],
    ['\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|typeof|instanceof|in|of|try|catch|finally|throw|import|from|export|default|async|await|null|undefined|true|false|static|get|set|yield|super|delete|void)\\b', 'tok-k'],
    ['\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', 'tok-n'],
    ['\\b[a-zA-Z_$][\\w$]*(?=\\s*\\()', 'tok-f'],
  ],
  python: [
    ['#[^\\n]*', 'tok-c'],
    ['"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'', 'tok-s'],
    ['\\b(?:def|return|if|elif|else|for|while|import|from|as|class|with|try|except|finally|raise|pass|break|continue|lambda|None|True|False|and|or|not|in|is|yield|global|nonlocal|assert|del)\\b', 'tok-k'],
    ['\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', 'tok-n'],
    ['\\b[a-zA-Z_]\\w*(?=\\s*\\()', 'tok-f'],
  ],
  html: [
    ['&lt;!--[\\s\\S]*?--&gt;', 'tok-c'],
    ['"[^"\\n]*"|\'[^\'\\n]*\'', 'tok-s'],
    ['&lt;\\/?[a-zA-Z][\\w-]*|\\/?&gt;', 'tok-t'],
    ['[\\w-]+(?=\\s*=)', 'tok-a'],
  ],
  css: [
    ['\\/\\*[\\s\\S]*?\\*\\/', 'tok-c'],
    ['"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'', 'tok-s'],
    ['@[\\w-]+', 'tok-k'],
    ['[\\w-]+(?=\\s*:)', 'tok-a'],
    ['\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\\b', 'tok-n'],
  ],
  json: [
    ['"(?:\\\\.|[^"\\\\])*"(?=\\s*:)', 'tok-a'],
    ['"(?:\\\\.|[^"\\\\])*"', 'tok-s'],
    ['-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', 'tok-n'],
    ['\\b(?:true|false|null)\\b', 'tok-k'],
  ],
};

const SAMPLES: Record<Lang, string> = {
  javascript:
`function greet(name) {
  // Say hello to the user
  const message = \`Hello, \${name}!\`;
  for (let i = 0; i < 3; i++) {
    console.log(message);
  }
  return true;
}`,
  python:
`def greet(name):
    # Say hello to the user
    message = f"Hello, {name}!"
    for i in range(3):
        print(message)
    return True`,
  html:
`<!-- A simple card -->
<div class="card" id="main">
  <h1>Hello world</h1>
  <p>Welcome to <a href="#">my site</a>.</p>
</div>`,
  css:
`/* Card styles */
.card {
  padding: 1rem;
  border-radius: 0.5rem;
  background: #ffffff;
}
@media (min-width: 768px) {
  .card { padding: 2rem; }
}`,
  json:
`{
  "name": "JaurTools",
  "free": true,
  "tools": 630,
  "rating": 4.9,
  "tags": ["tools", "free", null]
}`,
};

@Component({
  selector: 'app-syntax-highlighter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './syntax-highlighter.component.html',
  styleUrl: './syntax-highlighter.component.scss',
})
export class SyntaxHighlighterComponent implements OnDestroy {
  readonly slug = 'syntax-highlighter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['schema-markup-generator', 'word-counter', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly language = signal<Lang>('javascript');
  readonly code = signal(SAMPLES['javascript']);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly highlighted = computed(() => {
    const src = this.escapeHtml(this.code());
    const rules = RULES[this.language()];
    const master = new RegExp(rules.map(([s]) => `(${s})`).join('|'), 'g');
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = master.exec(src)) !== null) {
      out += src.slice(last, m.index);
      let cls = '';
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) { cls = rules[i - 1][1]; break; }
      }
      out += cls ? `<span class="${cls}">${m[0]}</span>` : m[0];
      last = m.index + m[0].length;
      if (m[0].length === 0) master.lastIndex++;
    }
    out += src.slice(last);
    return out;
  });

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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

  setLanguage(v: string) { this.language.set(v as Lang); }
  setCode(v: string) { this.code.set(v); }
  loadSample() { this.code.set(SAMPLES[this.language()]); }

  copyCode() {
    const text = this.code();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.flashCopied(),
        () => this.fallbackCopy(text)
      );
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    this.document.body.removeChild(ta);
    this.flashCopied();
  }

  private flashCopied() {
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  downloadHtml() {
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Highlighted code</title>
<style>
body{background:#f8fafc;color:#0f172a;font-family:ui-monospace,Menlo,Consolas,monospace}
pre{padding:1rem;white-space:pre-wrap}
.tok-k{color:#7c3aed;font-weight:600}.tok-s{color:#047857}.tok-c{color:#94a3b8;font-style:italic}
.tok-n{color:#b45309}.tok-f{color:#1d4ed8}.tok-t{color:#be123c}.tok-a{color:#a16207}
</style>
</head>
<body><pre>${this.highlighted()}</pre></body>
</html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const href = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = href;
    a.download = `highlighted-${this.language()}.html`;
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
