import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_CHARS = 200000;
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1 { color: #4f46e5; }
  </style>
</head>
<body>
  <h1>Hello, preview!</h1>
  <p>Edit the HTML on the left and watch this render live.</p>
</body>
</html>`;

@Component({
  selector: 'app-html-viewer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './html-viewer.component.html',
  styleUrl: './html-viewer.component.scss',
})
export class HtmlViewerComponent implements OnDestroy {
  readonly slug = 'html-viewer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['html-entities-encoder-decoder', 'css-loader-generator', 'flexbox-playground'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly html = signal(DEFAULT_HTML);
  readonly autoRender = signal(true);
  readonly previewTheme = signal<'light' | 'dark'>('light');
  readonly rendered = signal(DEFAULT_HTML);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly safeSrcdoc = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.rendered())
  );

  readonly tooLong = computed(() => this.html().length > MAX_CHARS);
  readonly lineCount = computed(() => this.html().split('\n').length);

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

  setHtml(v: string) {
    this.html.set(v.slice(0, MAX_CHARS));
    if (this.autoRender()) this.rendered.set(this.html());
  }

  toggleAutoRender() {
    this.autoRender.update((v) => !v);
    if (this.autoRender()) this.rendered.set(this.html());
  }

  renderNow() {
    this.rendered.set(this.html());
  }

  clear() {
    this.html.set('');
    this.rendered.set('');
  }

  setPreviewTheme(v: 'light' | 'dark') { this.previewTheme.set(v); }

  loadSample(): void {
    this.html.set(DEFAULT_HTML);
    this.rendered.set(DEFAULT_HTML);
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
