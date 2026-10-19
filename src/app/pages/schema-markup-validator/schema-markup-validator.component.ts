import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Issue {
  key: string;
  param: string;
}

interface BlockResult {
  index: number;
  type: string;
  errors: Issue[];
  warnings: Issue[];
}

const REQUIRED: Record<string, string[]> = {
  Article: ['headline'],
  BlogPosting: ['headline'],
  NewsArticle: ['headline'],
  Product: ['name'],
  FAQPage: ['mainEntity'],
  Recipe: ['name'],
  Event: ['name', 'startDate'],
  Organization: ['name'],
  LocalBusiness: ['name'],
  WebSite: ['name', 'url'],
  WebPage: ['name'],
  BreadcrumbList: ['itemListElement'],
  Review: ['itemReviewed', 'reviewRating'],
  Person: ['name'],
  JobPosting: ['title', 'hiringOrganization', 'datePosted'],
  SoftwareApplication: ['name', 'applicationCategory'],
  VideoObject: ['name', 'uploadDate'],
  HowTo: ['name', 'step'],
  ItemList: ['itemListElement'],
};

const RECOMMENDED: Record<string, string[]> = {
  Article: ['author', 'datePublished', 'image'],
  BlogPosting: ['author', 'datePublished', 'image'],
  NewsArticle: ['author', 'datePublished', 'image'],
  Product: ['description', 'image', 'offers', 'aggregateRating'],
  Recipe: ['recipeIngredient', 'recipeInstructions', 'image'],
  Event: ['location', 'eventStatus', 'image'],
  Organization: ['url', 'logo'],
  LocalBusiness: ['address', 'telephone'],
  WebSite: ['potentialAction'],
  Review: ['author', 'datePublished'],
  VideoObject: ['thumbnailUrl', 'description'],
  HowTo: ['description', 'image'],
  SoftwareApplication: ['operatingSystem', 'offers'],
  JobPosting: ['description', 'employmentType'],
  FAQPage: [],
  BreadcrumbList: [],
  WebPage: ['description'],
  Person: ['url'],
  ItemList: [],
};

@Component({
  selector: 'app-schema-markup-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './schema-markup-validator.component.html',
  styleUrl: './schema-markup-validator.component.scss',
})
export class SchemaMarkupValidatorComponent implements OnDestroy {
  readonly slug = 'schema-markup-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pwa-manifest-checker', 'web-app-manifest-generator', 'llms-txt-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly jsonInput = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private isEmpty(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  readonly parsed = computed((): { ok: true; blocks: Record<string, unknown>[] } | { ok: false } | null => {
    const raw = this.jsonInput().trim();
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as unknown;
      let blocks: Record<string, unknown>[];
      if (Array.isArray(data)) {
        blocks = data.filter((b) => b && typeof b === 'object') as Record<string, unknown>[];
      } else if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj['@graph'])) {
          blocks = (obj['@graph'] as unknown[]).filter((b) => b && typeof b === 'object') as Record<string, unknown>[];
        } else {
          blocks = [obj];
        }
      } else {
        return { ok: false };
      }
      if (blocks.length === 0) return { ok: false };
      return { ok: true, blocks };
    } catch {
      return { ok: false };
    }
  });

  readonly results = computed((): BlockResult[] => {
    const p = this.parsed();
    if (!p || !p.ok) return [];
    return p.blocks.map((b, i) => {
      const errors: Issue[] = [];
      const warnings: Issue[] = [];
      const ctx = b['@context'];
      const ctxStr = typeof ctx === 'string' ? ctx : Array.isArray(ctx) ? ctx.join(' ') : '';
      if (!ctxStr) errors.push({ key: 'eNoContext', param: '' });
      else if (!/schema\.org/i.test(ctxStr)) warnings.push({ key: 'wContext', param: ctxStr });
      const type = typeof b['@type'] === 'string' ? (b['@type'] as string) : '';
      if (!type) {
        errors.push({ key: 'eNoType', param: '' });
      } else if (!(type in REQUIRED)) {
        warnings.push({ key: 'wUnknownType', param: type });
      } else {
        for (const f of REQUIRED[type]) {
          if (this.isEmpty(b[f])) errors.push({ key: 'eMissingField', param: f });
        }
        for (const f of RECOMMENDED[type] ?? []) {
          if (this.isEmpty(b[f])) warnings.push({ key: 'wMissingRecommended', param: f });
        }
      }
      return { index: i + 1, type: type || '—', errors, warnings };
    });
  });

  readonly totals = computed(() => ({
    blocks: this.results().length,
    errors: this.results().reduce((s, r) => s + r.errors.length, 0),
    warnings: this.results().reduce((s, r) => s + r.warnings.length, 0),
  }));

  msg(key: string, param: string): string {
    this.translate.lang();
    return this.t('labels.' + key).replace('{v}', param).replace('{n}', param);
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

  setJson(v: string) { this.jsonInput.set(v); }
  clearInput() { this.jsonInput.set(''); }

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
