import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-xml-to-json',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './xml-to-json.component.html',
  styleUrl: './xml-to-json.component.scss',
})
export class XmlToJsonComponent implements OnDestroy {
  readonly slug = 'xml-to-json';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['xml-formatter', 'yaml-to-json', 'fake-json-generator'];

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

  readonly xml = signal('<catalog>\n  <book id="bk101">\n    <title>XML Guide</title>\n    <price>29.99</price>\n  </book>\n</catalog>');
  readonly copied = signal(false);

  setXml(v: string): void {
    this.xml.set(v.slice(0, 50000));
  }

  loadSample(): void {
    this.xml.set('<catalog>\n  <book id="bk101">\n    <title>XML Guide</title>\n    <price>29.99</price>\n  </book>\n</catalog>');
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
    const root = doc.documentElement;
    const obj: Record<string, unknown> = {};
    obj[root.tagName] = this.nodeToJson(root);
    return { error: '', text: JSON.stringify(obj, null, 2) };
  });

  readonly charCount = computed(() => this.result().text.length);

  copyJson(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.result().text)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadJson(): void {
    const blob = new Blob([this.result().text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'converted.json';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private nodeToJson(el: Element): unknown {
    const obj: Record<string, unknown> = {};
    for (const a of Array.from(el.attributes)) obj['@' + a.name] = a.value;
    const kids = Array.from(el.children);
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .filter((s) => s.length > 0)
      .join(' ');
    if (kids.length === 0) {
      if (Object.keys(obj).length === 0) return text;
      if (text) obj['#text'] = text;
      return obj;
    }
    for (const k of kids) {
      const v = this.nodeToJson(k);
      const key = k.tagName;
      if (key in obj) {
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
        (obj[key] as unknown[]).push(v);
      } else {
        obj[key] = v;
      }
    }
    if (text) obj['#text'] = text;
    return obj;
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
