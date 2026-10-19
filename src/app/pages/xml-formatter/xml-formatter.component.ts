import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-xml-formatter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './xml-formatter.component.html',
  styleUrl: './xml-formatter.component.scss',
})
export class XmlFormatterComponent implements OnDestroy {
  readonly slug = 'xml-formatter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['xml-to-json', 'yaml-formatter', 'sql-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly xml = signal('<catalog>\n  <book id="bk101"><title>XML Guide</title><price>29.99</price></book>\n  <book id="bk102"><title>JSON Guide</title><price>24.99</price></book>\n</catalog>');
  readonly indentSize = signal(2);
  readonly copied = signal(false);

  setXml(v: string): void {
    this.xml.set(v.slice(0, 50000));
  }

  setIndentSize(v: number): void {
    this.indentSize.set(this.clampNum(v, 1, 8));
  }

  loadSample(): void {
    this.xml.set('<catalog>\n<book id="bk101"><title>XML Guide</title><price>29.99</price></book>\n<book id="bk102"><title>JSON Guide</title><price>24.99</price></book>\n</catalog>');
  }

  clearXml(): void {
    this.xml.set('');
  }

  readonly result = computed((): { error: string; text: string } => {
    const src = this.xml().trim();
    if (!src) return { error: '', text: '' };
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(src, 'application/xml');
    } catch {
      return { error: this.t('labels.parseErrorLabel'), text: '' };
    }
    const err = doc.querySelector('parsererror');
    if (err) return { error: (err.textContent ?? this.t('labels.parseErrorLabel')).slice(0, 300), text: '' };
    return { error: '', text: this.serialize(doc, src) };
  });

  readonly charCount = computed(() => this.result().text.length);

  copyXml(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.result().text)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadXml(): void {
    const blob = new Blob([this.result().text], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'formatted.xml';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private serialize(doc: Document, src: string): string {
    const lines: string[] = [];
    const ind = this.indentSize();
    const pad = (d: number) => ' '.repeat(d * ind);
    const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const walk = (node: Node, depth: number): void => {
      if (node.nodeType === 3) {
        const t = node.textContent?.trim();
        if (t) lines.push(pad(depth) + escText(t));
        return;
      }
      if (node.nodeType === 8) {
        lines.push(pad(depth) + '<!--' + (node.textContent ?? '') + '-->');
        return;
      }
      if (node.nodeType === 4) {
        lines.push(pad(depth) + '<![CDATA[' + (node.textContent ?? '') + ']]>');
        return;
      }
      if (node.nodeType === 1) {
        const el = node as Element;
        const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('');
        const kids = Array.from(el.childNodes);
        if (kids.length === 0) {
          lines.push(pad(depth) + `<${el.tagName}${attrs}/>`);
          return;
        }
        if (kids.length === 1 && kids[0].nodeType === 3) {
          lines.push(pad(depth) + `<${el.tagName}${attrs}>${escText((kids[0].textContent ?? '').trim())}</${el.tagName}>`);
          return;
        }
        lines.push(pad(depth) + `<${el.tagName}${attrs}>`);
        for (const k of kids) walk(k, depth + 1);
        lines.push(pad(depth) + `</${el.tagName}>`);
        return;
      }
    };
    const decl = /^<\?xml[^?]*\?>/.exec(src);
    if (decl) lines.push(decl[0]);
    if (doc.documentElement) walk(doc.documentElement, 0);
    return lines.join('\n');
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
