import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface XmlNode {
  tag: string;
  attrs: { name: string; value: string }[];
  text: string;
  children: XmlNode[];
}

interface Parsed {
  ok: boolean;
  root: XmlNode | null;
  error: string;
  elements: number;
  attributes: number;
  depth: number;
}

const SAMPLE_XML = `<catalog>
  <book id="bk101" lang="en">
    <title>XML Developer's Guide</title>
    <price>44.95</price>
  </book>
  <book id="bk102" lang="hi">
    <title>Midnight Rain</title>
    <price>5.95</price>
  </book>
</catalog>`;

@Component({
  selector: 'app-xml-inspector',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgTemplateOutlet],
  templateUrl: './xml-inspector.component.html',
  styleUrl: './xml-inspector.component.scss',
})
export class XmlInspectorComponent implements OnDestroy {
  readonly slug = 'xml-inspector';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['zip-archive-content-viewer', 'zip-code-format-validator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly xmlText = signal(SAMPLE_XML);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed<Parsed>(() => {
    const text = this.xmlText().trim();
    if (!text) {
      return { ok: false, root: null, error: this.t('labels.errorEmpty'), elements: 0, attributes: 0, depth: 0 };
    }
    try {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const err = doc.getElementsByTagName('parsererror');
      if (err.length > 0) {
        const msg = err[0].textContent?.trim() ?? 'Invalid XML';
        return { ok: false, root: null, error: msg.split('\n')[0], elements: 0, attributes: 0, depth: 0 };
      }
      const rootEl = doc.documentElement;
      let elements = 0;
      let attributes = 0;
      let depth = 0;
      const build = (el: Element, d: number): XmlNode => {
        elements++;
        depth = Math.max(depth, d);
        const attrs = Array.from(el.attributes).map((a) => ({ name: a.name, value: a.value }));
        attributes += attrs.length;
        let textContent = '';
        const children: XmlNode[] = [];
        el.childNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) children.push(build(n as Element, d + 1));
          else if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) {
            textContent += n.textContent ?? '';
          }
        });
        return { tag: el.tagName, attrs, text: textContent.trim().slice(0, 200), children };
      };
      const root = build(rootEl, 1);
      return { ok: true, root, error: '', elements, attributes, depth };
    } catch {
      return { ok: false, root: null, error: this.t('labels.errorParse'), elements: 0, attributes: 0, depth: 0 };
    }
  });

  setXml(v: string) { this.xmlText.set(v.slice(0, 200000)); }
  loadSample() { this.xmlText.set(SAMPLE_XML); }
  clearXml() { this.xmlText.set(''); }

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
