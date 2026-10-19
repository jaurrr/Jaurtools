import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-svg-optimizer',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-optimizer.component.html',
  styleUrl: './svg-optimizer.component.scss',
})
export class SvgOptimizerComponent implements OnDestroy {
  readonly slug = 'svg-optimizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-editor', 'svg-converter', 'svg-to-png-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly svgInput = signal(
    '<!-- Sample icon -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n\n  <circle\n    cx="50"\n    cy="50"\n    r="40"\n    fill="#4f46e5"  />\n\n</svg>'
  );
  readonly optimized = signal('');
  readonly error = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly svgValid = computed(() => {
    const src = this.svgInput().trim();
    if (!src) return false;
    try {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      return doc.querySelector('parsererror') === null && doc.documentElement.nodeName.toLowerCase() === 'svg';
    } catch {
      return false;
    }
  });

  readonly originalPreview = computed((): SafeHtml =>
    this.svgValid() ? this.sanitizer.bypassSecurityTrustHtml(this.svgInput()) : ''
  );

  readonly optimizedPreview = computed((): SafeHtml =>
    this.optimized() ? this.sanitizer.bypassSecurityTrustHtml(this.optimized()) : ''
  );

  readonly beforeBytes = computed(() => new TextEncoder().encode(this.svgInput()).length);
  readonly afterBytes = computed(() => new TextEncoder().encode(this.optimized()).length);
  readonly savedBytes = computed(() => Math.max(0, this.beforeBytes() - this.afterBytes()));
  readonly savedPct = computed(() =>
    this.beforeBytes() > 0 ? (this.savedBytes() / this.beforeBytes()) * 100 : 0
  );

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

  setSvgInput(v: string) {
    this.svgInput.set(v);
    this.optimized.set('');
    this.error.set('');
  }

  loadFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSize'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.setSvgInput(String(reader.result ?? ''));
    reader.onerror = () => this.error.set(this.t('labels.errorRead'));
    reader.readAsText(file);
    input.value = '';
  }

  optimize() {
    this.error.set('');
    if (!this.svgValid()) {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    let out = this.svgInput();
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/>\s+</g, '><');
    out = out.replace(/\s{2,}/g, ' ');
    out = out.replace(/\s+>/g, '>');
    out = out.replace(/\s+\/>/g, '/>');
    this.optimized.set(out.trim());
  }

  downloadOptimized() {
    if (!this.optimized()) return;
    const url = URL.createObjectURL(new Blob([this.optimized()], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'optimized.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
