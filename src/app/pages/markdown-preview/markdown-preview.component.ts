import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLE_MD = `# Hello, Markdown!

Write **bold**, *italic*, and ~~strikethrough~~ text with \`inline code\`.

## Lists

- Apples
- Oranges
  - Nested item
- [x] Done task
- [ ] Todo task

1. First
2. Second

## Table

| Name | Price |
| :--- | ----: |
| Apples | 2.50 |
| Oranges | 3.00 |

> Blockquote: Markdown makes writing for the web simple.

[Visit JaurTools](https://jaurtools.com)

---
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url: string): string | null {
  const u = url.trim();
  if (u.length === 0) return null;
  if (/^(https?:|mailto:)/i.test(u)) return escapeHtml(u);
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return escapeHtml(u);
}

function inlineFormat(escaped: string): string {
  let s = escaped;
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = safeUrl(url);
    return safe === null ? alt : `<img src="${safe}" alt="${alt}" loading="lazy">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, text: string, url: string) => {
    const safe = safeUrl(url);
    return safe === null ? text : `<a href="${safe}">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/(?<![="'<>])(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return s;
}

function inlineMd(raw: string): string {
  const parts: string[] = [];
  const codeRe = /(`+)([\s\S]*?)\1/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(raw)) !== null) {
    parts.push(inlineFormat(escapeHtml(raw.slice(last, m.index))));
    parts.push('<code>' + escapeHtml(m[2]) + '</code>');
    last = m.index + m[0].length;
  }
  parts.push(inlineFormat(escapeHtml(raw.slice(last))));
  return parts.join('');
}

function splitCells(row: string): string[] {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|')) r = r.slice(0, -1);
  return r.split('|').map((c) => c.trim());
}

function tryTable(lines: string[], i: number): { html: string; next: number } | null {
  if (i + 1 >= lines.length || !lines[i].includes('|')) return null;
  const delimCells = splitCells(lines[i + 1]);
  if (delimCells.length === 0 || !delimCells.every((c) => /^:?-+:?$/.test(c))) return null;
  const headCells = splitCells(lines[i]);
  const aligns = delimCells.map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'ta-c' : c.endsWith(':') ? 'ta-r' : 'ta-l',
  );
  const cell = (tag: string, text: string, idx: number): string =>
    `<${tag} class="${aligns[idx] ?? 'ta-l'}">${inlineMd(text)}</${tag}>`;
  let html = '<table><thead><tr>';
  headCells.forEach((c, idx) => {
    html += cell('th', c, idx);
  });
  html += '</tr></thead><tbody>';
  let j = i + 2;
  while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
    const bodyCells = splitCells(lines[j]);
    html += '<tr>';
    headCells.forEach((_, idx) => {
      html += cell('td', bodyCells[idx] ?? '', idx);
    });
    html += '</tr>';
    j++;
  }
  html += '</tbody></table>';
  return { html, next: j };
}

function parseList(lines: string[], start: number): { html: string; next: number } {
  const items: { indent: number; type: 'ul' | 'ol'; checked?: boolean; text: string[] }[] = [];
  let i = start;
  const itemRe = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
  while (i < lines.length) {
    const m = itemRe.exec(lines[i]);
    if (!m || lines[i].trim() === '') break;
    const indent = m[1].replace(/\t/g, '    ').length;
    const type = /^\d/.test(m[2]) ? 'ol' : 'ul';
    const checked = m[3] !== undefined ? m[3].toLowerCase() === 'x' : undefined;
    items.push({ indent, type, checked, text: [m[4]] });
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !itemRe.test(lines[i])) {
      items[items.length - 1].text.push(lines[i].trim());
      i++;
    }
  }
  const render = (from: number, baseIndent: number): { html: string; next: number } => {
    let k = from;
    const listType = items[k].type;
    const isTask = items[k].checked !== undefined;
    let html = `<${listType}${isTask ? ' class="task-list"' : ''}>`;
    while (k < items.length && items[k].indent === baseIndent && items[k].type === listType) {
      const it = items[k];
      let inner = inlineMd(it.text.join(' '));
      if (it.checked !== undefined) {
        inner = `<input type="checkbox" disabled${it.checked ? ' checked' : ''}> ${inner}`;
      }
      let children = '';
      if (k + 1 < items.length && items[k + 1].indent > baseIndent) {
        const sub = render(k + 1, items[k + 1].indent);
        children = sub.html;
        k = sub.next - 1;
      }
      html += `<li>${inner}${children}</li>`;
      k++;
    }
    html += `</${listType}>`;
    return { html, next: k };
  };
  let htmlAll = '';
  let kk = 0;
  while (kk < items.length) {
    const r = render(kk, items[kk].indent);
    htmlAll += r.html;
    kk = r.next;
  }
  return { html: htmlAll, next: i };
}

function blocksToHtml(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  const para: string[] = [];
  const flushPara = (): void => {
    if (para.length > 0) {
      out.push('<p>' + para.map((l) => inlineMd(l)).join('<br>') + '</p>');
      para.length = 0;
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPara();
      i++;
      continue;
    }
    const fence = /^(```|~~~)(\w*)\s*$/.exec(trimmed);
    if (fence) {
      flushPara();
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code${lang}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^([-*_])(\s*\1){2,}\s*$/.test(trimmed)) {
      flushPara();
      out.push('<hr>');
      i++;
      continue;
    }
    const table = tryTable(lines, i);
    if (table) {
      flushPara();
      out.push(table.html);
      i = table.next;
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + blocksToHtml(buf) + '</blockquote>');
      continue;
    }
    if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) {
      flushPara();
      const list = parseList(lines, i);
      out.push(list.html);
      i = list.next;
      continue;
    }
    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join('\n');
}

export function mdToHtml(src: string): string {
  return blocksToHtml(src.replace(/\r\n?/g, '\n').split('\n'));
}

export function countWords(src: string): number {
  const stripped = src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/gm, ' ')
    .replace(/^\s*[-*+]\s+\[[ xX]\]/gm, ' ')
    .replace(/[#>*_~|\-[\]]/g, ' ');
  return stripped.split(/\s+/).filter(Boolean).length;
}

@Component({
  selector: 'app-markdown-preview',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './markdown-preview.component.html',
  styleUrl: './markdown-preview.component.scss',
})
export class MarkdownPreviewComponent implements OnDestroy {
  readonly slug = 'markdown-preview';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-viewer', 'json-formatter', 'javascript-obfuscator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mdText = signal(SAMPLE_MD);
  readonly copied = signal(false);
  readonly html = computed(() => mdToHtml(this.mdText()));
  readonly wordCount = computed(() => countWords(this.mdText()));
  readonly charCount = computed(() => this.mdText().length);
  readonly lineCount = computed(() => this.mdText().split('\n').length);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: number | null = null;

  readonly restored = signal(false);

  private saveTimer: number | null = null;

  constructor() {
    const saved = this.readSaved();
    if (saved !== null) {
      this.mdText.set(saved);
      this.restored.set(true);
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const v = this.mdText();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem('jt-markdown-preview-input', v);
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 700);
    });
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

  setMd(v: string): void {
    this.mdText.set(v);
  
    this.restored.set(false);
  }

  async copyHtml(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.html()).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = this.html();
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => this.copied.set(false), 2000);
  }

  download(kind: 'html' | 'md'): void {
    const isHtml = kind === 'html';
    const body = isHtml
      ? `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Markdown export</title>\n</head>\n<body>\n${this.html()}\n</body>\n</html>\n`
      : this.mdText();
    const blob = new Blob([body], { type: isHtml ? 'text/html' : 'text/markdown' });
    const a = this.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isHtml ? 'markdown-export.html' : 'markdown-export.md';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  loadSample(): void {
    this.mdText.set(SAMPLE_MD);
    this.restored.set(false);
  }


  onUpload(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === 'string' ? reader.result : '';
      this.setMd(v.slice(0, 100000));
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
      const v = localStorage.getItem('jt-markdown-preview-input');
      return v && v.trim() ? v.slice(0, 100000) : null;
    } catch {
      return null;
    }
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
