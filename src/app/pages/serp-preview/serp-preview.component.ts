import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-serp-preview',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './serp-preview.component.html',
  styleUrl: './serp-preview.component.scss',
})
export class SerpPreviewComponent implements OnDestroy {
  readonly slug = 'serp-preview';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['responsive-website-tester', 'url-parser', 'markdown-html'];

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

  readonly title = signal('Free Online Tools - No Signup Needed | JaurTools');
  readonly url = signal('https://jaurtools.com/en/');
  readonly description = signal('Use 600+ free browser-based tools: calculators, converters, PDF tools and more. No signup, no downloads, 100% private.');
  readonly device = signal<'desktop' | 'mobile'>('desktop');
  readonly copied = signal(false);

  setTitle(v: string): void { this.title.set(v.slice(0, 200)); }
  setUrl(v: string): void { this.url.set(v.slice(0, 300)); }
  setDescription(v: string): void { this.description.set(v.slice(0, 400)); }
  setDevice(d: 'desktop' | 'mobile'): void { this.device.set(d); }

  readonly titleLen = computed(() => Array.from(this.title()).length);
  readonly descLen = computed(() => Array.from(this.description()).length);
  readonly titleOk = computed(() => this.titleLen() <= 60);
  readonly descOk = computed(() => this.descLen() <= 155);

  readonly siteName = computed(() => {
    try {
      return new URL(this.url().trim()).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });

  readonly faviconLetter = computed(() => {
    const h = this.siteName();
    return h ? h.charAt(0).toUpperCase() : 'J';
  });

  copyMetaTags(): void {
    if (!navigator.clipboard) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const tags = `<title>${esc(this.title())}</title>\n<meta name="description" content="${esc(this.description())}">`;
    navigator.clipboard
      .writeText(tags)
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
