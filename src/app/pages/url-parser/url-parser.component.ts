import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SAMPLE_URL = 'https://jaurtools.com/en/url-parser?tool=url&utm_source=google#features';

@Component({
  selector: 'app-url-parser',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './url-parser.component.html',
  styleUrl: './url-parser.component.scss',
})
export class UrlParserComponent implements OnDestroy {
  readonly slug = 'url-parser';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['regex-tester', 'mime-types', 'serp-preview'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  readonly restored = signal(false);

  private saveTimer: number | null = null;
  private liveTimer: number | null = null;

  constructor() {
    const saved = this.readSaved();
    if (saved !== null) {
      this.inputUrl.set(saved);
      this.restored.set(true);
    }
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const v = this.inputUrl();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem('jt-url-parser-input', v);
        } catch {
          /* storage unavailable — tool still works */
        }
      }, 700);
    });
    effect(() => {
      const v = this.inputUrl();
      if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
      this.liveTimer = window.setTimeout(() => this.parse(), 450);
    });
    this.parse();
  }

  readonly inputUrl = signal(SAMPLE_URL);
  readonly error = signal('');
  readonly parts = signal({ protocol: '', host: '', port: '', pathname: '', hash: '' });
  readonly params = signal<{ key: string; value: string }[]>([]);
  readonly copied = signal(false);

  setInput(v: string): void {
    this.inputUrl.set(v.slice(0, 2000));
  
    this.restored.set(false);
  }

  parse(): void {
    const raw = this.inputUrl().trim();
    if (!raw) {
      this.error.set('empty');
      return;
    }
    try {
      const u = new URL(raw);
      this.parts.set({
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port: u.port || '\u2014',
        pathname: u.pathname || '/',
        hash: u.hash ? u.hash.slice(1) : '\u2014',
      });
      const list: { key: string; value: string }[] = [];
      u.searchParams.forEach((value, key) => list.push({ key, value }));
      this.params.set(list);
      this.error.set('');
    } catch {
      this.error.set('invalid');
    }
  }

  updateParam(i: number, field: 'key' | 'value', v: string): void {
    const next = this.params().map((p) => ({ ...p }));
    if (next[i]) {
      next[i][field] = v.slice(0, 500);
      this.params.set(next);
    }
  }

  addParam(): void {
    this.params.update((p) => [...p, { key: 'key', value: 'value' }]);
  }

  removeParam(i: number): void {
    this.params.update((p) => p.filter((_, idx) => idx !== i));
  }

  rebuild(): void {
    if (this.error() === 'invalid') return;
    const p = this.parts();
    const host = p.host || 'example.com';
    const port = p.port && p.port !== '\u2014' ? ':' + p.port : '';
    const sp = new URLSearchParams();
    for (const param of this.params()) {
      if (param.key) sp.append(param.key, param.value);
    }
    const qs = sp.toString();
    const hash = p.hash && p.hash !== '\u2014' ? '#' + p.hash : '';
    this.inputUrl.set(`${p.protocol || 'https'}://${host}${port}${p.pathname || '/'}${qs ? '?' + qs : ''}${hash}`);
    this.parse();
  }

  copyUrl(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.inputUrl())
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
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


  loadSample(): void {
    this.inputUrl.set(SAMPLE_URL);
    this.restored.set(false);
    this.parse();
  }

  ngOnDestroy() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }


  private readSaved(): string | null {
    try {
      const v = localStorage.getItem('jt-url-parser-input');
      return v && v.trim() ? v.slice(0, 2000) : null;
    } catch {
      return null;
    }
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
