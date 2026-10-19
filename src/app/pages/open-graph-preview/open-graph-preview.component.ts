import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-open-graph-preview',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './open-graph-preview.component.html',
  styleUrl: './open-graph-preview.component.scss',
})
export class OpenGraphPreviewComponent implements OnDestroy {
  readonly slug = 'open-graph-preview';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['schema-markup-validator', 'llms-txt-generator', 'web-app-manifest-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly metaInput = signal('');
  readonly mTitle = signal('');
  readonly mDesc = signal('');
  readonly mImage = signal('');
  readonly mUrl = signal('');
  readonly cardType = signal<'auto' | 'summary' | 'large'>('auto');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed((): Record<string, string> => {
    const out: Record<string, string> = {};
    const tags = this.metaInput().match(/<meta\b[^>]*>/gi) ?? [];
    for (const tag of tags) {
      const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase().trim();
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
      if (name) out[name] = content.trim();
    }
    return out;
  });

  readonly card = computed(() => {
    const p = this.parsed();
    const pick = (...keys: string[]): string => {
      for (const k of keys) if (p[k]) return p[k];
      return '';
    };
    const title = this.mTitle().trim() || pick('twitter:title', 'og:title');
    const desc = this.mDesc().trim() || pick('twitter:description', 'og:description');
    const image = this.mImage().trim() || pick('twitter:image', 'og:image');
    const url = this.mUrl().trim() || pick('og:url');
    const rawCard = (p['twitter:card'] || '').toLowerCase();
    const type = this.cardType() === 'auto' ? (rawCard === 'summary_large_image' ? 'large' : 'summary') : this.cardType() === 'large' ? 'large' : 'summary';
    return { title, desc, image, url, type };
  });

  readonly domain = computed(() => {
    try {
      return new URL(this.card().url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });

  readonly issues = computed(() => {
    const c = this.card();
    const out: string[] = [];
    if (!c.title) out.push('warnNoTitle');
    if (!c.desc) out.push('warnNoDesc');
    if (!c.image) out.push('warnNoImage');
    else if (!/^https:\/\//i.test(c.image)) out.push('warnImageHttp');
    return out;
  });

  readonly hasAny = computed(() => {
    const c = this.card();
    return Boolean(c.title || c.desc || c.image || c.url || this.metaInput().trim());
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

  setMeta(v: string) { this.metaInput.set(v); }
  setMTitle(v: string) { this.mTitle.set(v); }
  setMDesc(v: string) { this.mDesc.set(v); }
  setMImage(v: string) { this.mImage.set(v); }
  setMUrl(v: string) { this.mUrl.set(v); }
  setCardType(v: 'auto' | 'summary' | 'large') { this.cardType.set(v); }
  clearInput() {
    this.metaInput.set('');
    this.mTitle.set('');
    this.mDesc.set('');
    this.mImage.set('');
    this.mUrl.set('');
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
