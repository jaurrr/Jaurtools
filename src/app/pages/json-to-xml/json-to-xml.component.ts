import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

function sanitizeName(name: string): string {
  let s = name.replace(/[^A-Za-z0-9_.\-]/g, '_');
  if (!/^[A-Za-z_]/.test(s)) s = '_' + s;
  return s || 'item';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toXml(value: unknown, name: string, indent: string): string {
  const tag = sanitizeName(name);
  if (value === null || value === undefined) return `${indent}<${tag}/>`;
  if (Array.isArray(value)) {
    return value.map((item) => toXml(item, name, indent)).join('\n');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const attrs: string[] = [];
    let text = '';
    const children: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@')) {
        attrs.push(`${sanitizeName(k.slice(1))}="${escapeXml(String(v))}"`);
      } else if (k === '#text') {
        text = escapeXml(String(v));
      } else {
        children.push(toXml(v, k, indent + '  '));
      }
    }
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    if (children.length === 0) {
      return text
        ? `${indent}<${tag}${attrStr}>${text}</${tag}>`
        : `${indent}<${tag}${attrStr}/>`;
    }
    return `${indent}<${tag}${attrStr}>\n${children.join('\n')}\n${indent}</${tag}>`;
  }
  return `${indent}<${tag}>${escapeXml(String(value))}</${tag}>`;
}

const SAMPLE = `{
  "order": {
    "@id": "A1023",
    "customer": "Asha Sharma",
    "items": [
      { "name": "Keyboard", "qty": 2, "price": 1499 },
      { "name": "Mouse", "qty": 1, "price": 799 }
    ],
    "paid": true,
    "note": null
  }
}`;

@Component({
  selector: 'app-json-to-xml',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './json-to-xml.component.html',
  styleUrl: './json-to-xml.component.scss',
})
export class JsonToXmlComponent implements OnDestroy {
  readonly slug = 'json-to-xml';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['json-formatter', 'json-validator', 'json-typescript'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(SAMPLE);
  readonly rootName = signal('root');
  readonly declaration = signal(true);
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

  readonly output = computed(() => {
    const text = this.input();
    if (!text.trim()) return { xml: '', error: null as string | null };
    try {
      const value = JSON.parse(text);
      const body = toXml(value, this.rootName().trim() || 'root', '');
      const xml = this.declaration()
        ? `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
        : body;
      return { xml, error: null as string | null };
    } catch (e) {
      return { xml: '', error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
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

  setInput(v: string): void {
    this.input.set(v);
  }

  setRootName(v: string): void {
    this.rootName.set(v);
  }

  async copyOutput(): Promise<void> {
    const xml = this.output().xml;
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml).catch(() => undefined);
    } catch {
      const ta = this.document.createElement('textarea');
      ta.value = xml;
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
    const xml = this.output().xml;
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'converted.xml';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  loadSample(): void {
    this.input.set(SAMPLE);
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
