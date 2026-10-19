import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-svg-editor',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-editor.component.html',
  styleUrl: './svg-editor.component.scss',
})
export class SvgEditorComponent implements OnDestroy {
  readonly slug = 'svg-editor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-editor', 'svg-optimizer', 'svg-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly svgInput = signal(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">\n' +
      '  <rect x="10" y="10" width="100" height="100" rx="20" fill="#4f46e5"/>\n' +
      '  <circle cx="60" cy="60" r="30" fill="#ffffff"/>\n</svg>'
  );
  readonly previewCode = signal('');
  readonly zoom = signal(100);
  readonly stage = signal<'checker' | 'light' | 'dark'>('checker');
  readonly copied = signal(false);
  readonly error = signal('');

  private debounceId: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    this.previewCode.set(this.svgInput());
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const code = this.svgInput();
      if (this.debounceId) clearTimeout(this.debounceId);
      this.debounceId = setTimeout(() => this.previewCode.set(code), 250);
    });
  }

  readonly svgValid = computed(() => {
    const src = this.previewCode().trim();
    if (!src) return false;
    try {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      return doc.querySelector('parsererror') === null && doc.documentElement.nodeName.toLowerCase() === 'svg';
    } catch {
      return false;
    }
  });

  readonly preview = computed((): SafeHtml =>
    this.svgValid() ? this.sanitizer.bypassSecurityTrustHtml(this.previewCode()) : ''
  );

  readonly lineCount = computed(() => this.svgInput().split('\n').length);
  readonly charCount = computed(() => this.svgInput().length);

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

  setSvgInput(v: string) { this.svgInput.set(v); }
  setZoom(v: number) { this.zoom.set(Math.round(this.clampNum(v, 25, 400))); }
  setStage(s: 'checker' | 'light' | 'dark') { this.stage.set(s); }

  clear() {
    this.svgInput.set('');
    this.error.set('');
  }

  loadFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSvgSize'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.svgInput.set(String(reader.result ?? ''));
      this.error.set('');
    };
    reader.onerror = () => this.error.set(this.t('labels.errorRead'));
    reader.readAsText(file);
    input.value = '';
  }

  copyCode() {
    const code = this.svgInput();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => this.fallbackCopy(code, done));
    } else {
      this.fallbackCopy(code, done);
    }
  }

  private fallbackCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      /* clipboard unavailable */
    }
    ta.remove();
  }

  downloadSvg() {
    if (!this.svgValid()) {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    const url = URL.createObjectURL(new Blob([this.previewCode()], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'viewed.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    if (this.debounceId) clearTimeout(this.debounceId);
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
