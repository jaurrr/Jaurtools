import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-markdown-html',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './markdown-html.component.html',
  styleUrl: './markdown-html.component.scss',
})
export class MarkdownHtmlComponent implements OnDestroy {
  readonly slug = 'markdown-html';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['markdown-table-generator', 'xml-to-json', 'yaml-to-json'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;
  private readonly sanitizer = inject(DomSanitizer);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly source = signal('# Hello JaurTools\n\nWrite **Markdown** on the left and see *live HTML* on the right.\n\n- Fast\n- Free\n- Private\n\n[Visit JaurTools](https://jaurtools.com)');
  readonly copied = signal(false);

  setSource(v: string): void {
    this.source.set(v.slice(0, 30000));
  }

  loadSample(): void {
    this.source.set('# Sample Document\n\nThis is **bold**, this is *italic*, and this is `inline code`.\n\n## Lists\n\n- First item\n- Second item\n\n1. Step one\n2. Step two\n\n> A wise quote about writing clearly.\n\n[Learn more](https://jaurtools.com)');
  }

  clearAll(): void {
    this.source.set('');
  }

  readonly html = computed(() => this.toHtml(this.source()));
  readonly safeHtml = computed((): SafeHtml => this.sanitizer.bypassSecurityTrustHtml(this.html()));
  readonly htmlLength = computed(() => this.html().length);

  copyHtml(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.html())
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadHtml(): void {
    const doc = '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Converted</title></head>\n<body>\n' + this.html() + '\n</body>\n</html>\n';
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'converted.html';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private inline(s: string): string {
    let out = this.escapeHtml(s);
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|\W)\*([^\*\n]+)\*/g, '$1<em>$2</em>');
    return out;
  }

  private toHtml(src: string): string {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const out: string[] = [];
    let inCode = false;
    let codeBuf: string[] = [];
    let listKind = '';
    const closeList = () => {
      if (listKind) { out.push(listKind === 'ul' ? '</ul>' : '</ol>'); listKind = ''; }
    };
    for (const rawLine of lines) {
      const line = rawLine;
      if (line.trim().startsWith('```')) {
        if (inCode) {
          out.push('<pre><code>' + this.escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          codeBuf = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      const trimmed = line.trim();
      if (!trimmed) { closeList(); continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (h) { closeList(); out.push(`<h${h[1].length}>${this.inline(h[2])}</h${h[1].length}>`); continue; }
      if (trimmed.startsWith('> ')) { closeList(); out.push('<blockquote>' + this.inline(trimmed.slice(2)) + '</blockquote>'); continue; }
      if (/^---+$/.test(trimmed)) { closeList(); out.push('<hr>'); continue; }
      const ul = /^[-*]\s+(.*)$/.exec(trimmed);
      if (ul) {
        if (listKind !== 'ul') { closeList(); out.push('<ul>'); listKind = 'ul'; }
        out.push('<li>' + this.inline(ul[1]) + '</li>');
        continue;
      }
      const ol = /^(\d+)\.\s+(.*)$/.exec(trimmed);
      if (ol) {
        if (listKind !== 'ol') { closeList(); out.push('<ol>'); listKind = 'ol'; }
        out.push('<li>' + this.inline(ol[2]) + '</li>');
        continue;
      }
      closeList();
      out.push('<p>' + this.inline(trimmed) + '</p>');
    }
    if (inCode) out.push('<pre><code>' + this.escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    closeList();
    return out.join('\n');
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

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
