import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-meta-tags-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './meta-tags-generator.component.html',
  styleUrl: './meta-tags-generator.component.scss',
})
export class MetaTagsGeneratorComponent implements OnDestroy {
  readonly slug = 'meta-tags-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['robots-txt-generator', 'htaccess-redirect-generator', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly title = signal('My Awesome Page');
  readonly description = signal('A short, compelling summary of this page in about 155 characters.');
  readonly keywords = signal('example, keywords, seo');
  readonly author = signal('');
  readonly robots = signal('index, follow');
  readonly canonical = signal('');
  readonly themeColor = signal('#4f46e5');
  readonly ogTitle = signal('');
  readonly ogDescription = signal('');
  readonly ogType = signal('website');
  readonly ogUrl = signal('');
  readonly ogImage = signal('');
  readonly ogSiteName = signal('');
  readonly twitterCard = signal('summary_large_image');
  readonly twitterSite = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private esc(s: string): string {
    return s.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  readonly titleLen = computed(() => this.title().length);
  readonly descLen = computed(() => this.description().length);

  readonly html = computed(() => {
    const e = (v: string) => this.esc(v);
    const lines: string[] = ['<!-- Basic SEO -->', `<title>${e(this.title())}</title>`];
    if (this.description().trim()) lines.push(`<meta name="description" content="${e(this.description())}">`);
    if (this.keywords().trim()) lines.push(`<meta name="keywords" content="${e(this.keywords())}">`);
    if (this.author().trim()) lines.push(`<meta name="author" content="${e(this.author())}">`);
    lines.push(`<meta name="robots" content="${e(this.robots())}">`);
    if (this.canonical().trim()) lines.push(`<link rel="canonical" href="${e(this.canonical())}">`);
    lines.push(`<meta name="theme-color" content="${e(this.themeColor())}">`);
    lines.push('', '<!-- Open Graph -->');
    const ogT = this.ogTitle().trim() || this.title();
    const ogD = this.ogDescription().trim() || this.description();
    lines.push(`<meta property="og:title" content="${e(ogT)}">`);
    if (ogD.trim()) lines.push(`<meta property="og:description" content="${e(ogD)}">`);
    lines.push(`<meta property="og:type" content="${e(this.ogType())}">`);
    if (this.ogUrl().trim()) lines.push(`<meta property="og:url" content="${e(this.ogUrl())}">`);
    if (this.ogImage().trim()) lines.push(`<meta property="og:image" content="${e(this.ogImage())}">`);
    if (this.ogSiteName().trim()) lines.push(`<meta property="og:site_name" content="${e(this.ogSiteName())}">`);
    lines.push('', '<!-- Twitter Card -->');
    lines.push(`<meta name="twitter:card" content="${e(this.twitterCard())}">`);
    lines.push(`<meta name="twitter:title" content="${e(ogT)}">`);
    if (ogD.trim()) lines.push(`<meta name="twitter:description" content="${e(ogD)}">`);
    if (this.ogImage().trim()) lines.push(`<meta name="twitter:image" content="${e(this.ogImage())}">`);
    if (this.twitterSite().trim()) lines.push(`<meta name="twitter:site" content="${e(this.twitterSite())}">`);
    return lines.join('\n');
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

  async copyHtml(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.html()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  download(): void {
    const blob = new Blob([this.html()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'meta-tags.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
