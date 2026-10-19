import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface CountryRule {
  code: string;
  pattern: string;
  flags?: string;
  example: string;
  noPostal?: boolean;
}

const RULES: CountryRule[] = [
  { code: 'in', pattern: '^[1-9][0-9]{5}$', example: '500001' },
  { code: 'us', pattern: '^\\d{5}(-\\d{4})?$', example: '90210' },
  { code: 'gb', pattern: '^[A-Z]{1,2}[0-9][A-Z0-9]?\\s?[0-9][A-Z]{2}$', flags: 'i', example: 'SW1A 1AA' },
  { code: 'ca', pattern: '^[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d$', flags: 'i', example: 'K1A 0B1' },
  { code: 'au', pattern: '^\\d{4}$', example: '2000' },
  { code: 'de', pattern: '^\\d{5}$', example: '10115' },
  { code: 'fr', pattern: '^\\d{5}$', example: '75001' },
  { code: 'sa', pattern: '^\\d{5}(-\\d{4})?$', example: '12271' },
  { code: 'ae', pattern: '', example: '', noPostal: true },
  { code: 'jp', pattern: '^\\d{3}-\\d{4}$', example: '100-0001' },
  { code: 'br', pattern: '^\\d{5}-?\\d{3}$', example: '01310-100' },
  { code: 'pk', pattern: '^\\d{5}$', example: '44000' },
  { code: 'bd', pattern: '^\\d{4}$', example: '1000' },
];

@Component({
  selector: 'app-zip-code-format-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './zip-code-format-validator.component.html',
  styleUrl: './zip-code-format-validator.component.scss',
})
export class ZipCodeFormatValidatorComponent implements OnDestroy {
  readonly slug = 'zip-code-format-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['zip-archive-content-viewer', 'unzip-files-online'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly country = signal('in');
  readonly code = signal('500001');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly rules = RULES;

  readonly activeRule = computed(() => this.rules.find((r) => r.code === this.country()) ?? this.rules[0]);

  readonly state = computed<'idle' | 'valid' | 'invalid' | 'notused'>(() => {
    const rule = this.activeRule();
    if (rule.noPostal) return 'notused';
    const value = this.code().trim();
    if (!value) return 'idle';
    const re = new RegExp(rule.pattern, rule.flags ?? '');
    return re.test(value) ? 'valid' : 'invalid';
  });

  countryName(code: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.labels.countries.${code}`);
    return typeof raw === 'string' ? raw : code;
  }

  formatHint(code: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.labels.formats.${code}`);
    return typeof raw === 'string' ? raw : '';
  }

  setCountry(v: string) { this.country.set(v); }
  setCode(v: string) { this.code.set(v.slice(0, 20)); }

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
