import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface StatusCode { code: number; name: string; cat: string; }

const CODES: StatusCode[] = [
  { code: 100, name: 'Continue', cat: '1xx' },
  { code: 101, name: 'Switching Protocols', cat: '1xx' },
  { code: 103, name: 'Early Hints', cat: '1xx' },
  { code: 200, name: 'OK', cat: '2xx' },
  { code: 201, name: 'Created', cat: '2xx' },
  { code: 202, name: 'Accepted', cat: '2xx' },
  { code: 204, name: 'No Content', cat: '2xx' },
  { code: 206, name: 'Partial Content', cat: '2xx' },
  { code: 301, name: 'Moved Permanently', cat: '3xx' },
  { code: 302, name: 'Found', cat: '3xx' },
  { code: 303, name: 'See Other', cat: '3xx' },
  { code: 304, name: 'Not Modified', cat: '3xx' },
  { code: 307, name: 'Temporary Redirect', cat: '3xx' },
  { code: 308, name: 'Permanent Redirect', cat: '3xx' },
  { code: 400, name: 'Bad Request', cat: '4xx' },
  { code: 401, name: 'Unauthorized', cat: '4xx' },
  { code: 402, name: 'Payment Required', cat: '4xx' },
  { code: 403, name: 'Forbidden', cat: '4xx' },
  { code: 404, name: 'Not Found', cat: '4xx' },
  { code: 405, name: 'Method Not Allowed', cat: '4xx' },
  { code: 408, name: 'Request Timeout', cat: '4xx' },
  { code: 409, name: 'Conflict', cat: '4xx' },
  { code: 410, name: 'Gone', cat: '4xx' },
  { code: 413, name: 'Content Too Large', cat: '4xx' },
  { code: 414, name: 'URI Too Long', cat: '4xx' },
  { code: 415, name: 'Unsupported Media Type', cat: '4xx' },
  { code: 422, name: 'Unprocessable Content', cat: '4xx' },
  { code: 425, name: 'Too Early', cat: '4xx' },
  { code: 426, name: 'Upgrade Required', cat: '4xx' },
  { code: 429, name: 'Too Many Requests', cat: '4xx' },
  { code: 431, name: 'Request Header Fields Too Large', cat: '4xx' },
  { code: 451, name: 'Unavailable For Legal Reasons', cat: '4xx' },
  { code: 500, name: 'Internal Server Error', cat: '5xx' },
  { code: 501, name: 'Not Implemented', cat: '5xx' },
  { code: 502, name: 'Bad Gateway', cat: '5xx' },
  { code: 503, name: 'Service Unavailable', cat: '5xx' },
  { code: 504, name: 'Gateway Timeout', cat: '5xx' },
  { code: 505, name: 'HTTP Version Not Supported', cat: '5xx' },
  { code: 507, name: 'Insufficient Storage', cat: '5xx' },
  { code: 511, name: 'Network Authentication Required', cat: '5xx' },
];

const CATS = ['all', '1xx', '2xx', '3xx', '4xx', '5xx'];

@Component({
  selector: 'app-http-status-codes',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './http-status-codes.component.html',
  styleUrl: './http-status-codes.component.scss',
})
export class HttpStatusCodesComponent implements OnDestroy {
  readonly slug = 'http-status-codes';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['curl-fetch-axios-converter', 'hash-generator', 'hmac-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly query = signal('');
  readonly cat = signal('all');
  readonly cats = CATS;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.cat();
    return CODES.filter((c) => {
      if (cat !== 'all' && c.cat !== cat) return false;
      if (!q) return true;
      const desc = this.t(`codes.c${c.code}.desc`).toLowerCase();
      return String(c.code).includes(q) || c.name.toLowerCase().includes(q) || desc.includes(q);
    });
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

  setQuery(v: string) { this.query.set(v); }
  setCat(c: string) { this.cat.set(c); }

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
