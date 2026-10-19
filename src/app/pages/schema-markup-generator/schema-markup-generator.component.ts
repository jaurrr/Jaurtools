import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SchemaKind = 'FAQPage' | 'Organization' | 'Article' | 'Product' | 'LocalBusiness' | 'WebSite';

@Component({
  selector: 'app-schema-markup-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './schema-markup-generator.component.html',
  styleUrl: './schema-markup-generator.component.scss',
})
export class SchemaMarkupGeneratorComponent implements OnDestroy {
  readonly slug = 'schema-markup-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['syntax-highlighter', 'word-counter', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly schemaType = signal<SchemaKind>('FAQPage');
  readonly name = signal('');
  readonly description = signal('');
  readonly url = signal('');
  readonly author = signal('');
  readonly datePublished = signal('');
  readonly price = signal('');
  readonly priceCurrency = signal('USD');
  readonly availability = signal<'in' | 'out'>('in');
  readonly phone = signal('');
  readonly address = signal('');
  readonly question = signal('');
  readonly answer = signal('');
  readonly logo = signal('');
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

  readonly schemaObject = computed(() => {
    const base: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': this.schemaType(),
    };
    const put = (k: string, v: string) => { if (v.trim()) base[k] = v.trim(); };
    switch (this.schemaType()) {
      case 'FAQPage':
        put('url', this.url());
        if (this.question().trim()) {
          base['mainEntity'] = [{
            '@type': 'Question',
            name: this.question().trim(),
            acceptedAnswer: { '@type': 'Answer', text: this.answer().trim() },
          }];
        }
        break;
      case 'Organization':
        put('name', this.name());
        put('description', this.description());
        put('url', this.url());
        if (this.logo().trim()) base['logo'] = this.logo().trim();
        break;
      case 'Article':
        put('headline', this.name());
        put('description', this.description());
        put('url', this.url());
        if (this.author().trim()) base['author'] = { '@type': 'Person', name: this.author().trim() };
        put('datePublished', this.datePublished());
        break;
      case 'Product':
        put('name', this.name());
        put('description', this.description());
        put('url', this.url());
        if (this.price().trim()) {
          base['offers'] = {
            '@type': 'Offer',
            price: this.price().trim(),
            priceCurrency: this.priceCurrency().trim() || 'USD',
            availability: this.availability() === 'in'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          };
        }
        break;
      case 'LocalBusiness':
        put('name', this.name());
        put('description', this.description());
        put('url', this.url());
        put('telephone', this.phone());
        put('address', this.address());
        break;
      case 'WebSite':
        put('name', this.name());
        put('url', this.url());
        break;
    }
    return base;
  });

  readonly jsonLd = computed(() => JSON.stringify(this.schemaObject(), null, 2));

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

  setSchemaType(v: string) { this.schemaType.set(v as SchemaKind); }
  setName(v: string) { this.name.set(v); }
  setDescription(v: string) { this.description.set(v); }
  setUrl(v: string) { this.url.set(v); }
  setAuthor(v: string) { this.author.set(v); }
  setDatePublished(v: string) { this.datePublished.set(v); }
  setPrice(v: string) { this.price.set(v); }
  setPriceCurrency(v: string) { this.priceCurrency.set(v); }
  setAvailability(v: string) { this.availability.set(v as 'in' | 'out'); }
  setPhone(v: string) { this.phone.set(v); }
  setAddress(v: string) { this.address.set(v); }
  setQuestion(v: string) { this.question.set(v); }
  setAnswer(v: string) { this.answer.set(v); }
  setLogo(v: string) { this.logo.set(v); }

  copyJson() {
    const text = this.jsonLd();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.flashCopied(),
        () => this.fallbackCopy(text)
      );
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    this.document.body.removeChild(ta);
    this.flashCopied();
  }

  private flashCopied() {
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  downloadJson() {
    const blob = new Blob([this.jsonLd()], { type: 'application/ld+json' });
    const href = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = href;
    a.download = `${this.schemaType().toLowerCase()}-schema.json`;
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
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
