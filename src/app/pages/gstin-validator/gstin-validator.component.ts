import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-gstin-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './gstin-validator.component.html',
  styleUrl: './gstin-validator.component.scss',
})
export class GstinValidatorComponent implements OnDestroy {
  readonly slug = 'gstin-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pan-validator', 'aadhaar-validator', 'emi-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly gstin = signal('07ABCPE1234F1ZD');

  private readonly stateCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38'];

  private readonly holderCodes = ['C', 'P', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private static charValue(c: string): number {
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
    return c.charCodeAt(0) - 55;
  }

  private static valueChar(v: number): string {
    if (v < 10) return String.fromCharCode(48 + v);
    return String.fromCharCode(55 + v);
  }

  private static checkChar(base14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const factor = (i + 1) % 2 === 0 ? 2 : 1;
      const product = factor * GstinValidatorComponent.charValue(base14[i]);
      sum += Math.floor(product / 36) + (product % 36);
    }
    return GstinValidatorComponent.valueChar((36 - (sum % 36)) % 36);
  }

  readonly cleaned = computed(() => this.gstin().trim().toUpperCase());

  readonly analysis = computed(() => {
    const raw = this.cleaned();
    if (!raw) return { status: 'empty', reason: '', stateCode: '', entityCode: '', expected: '' };
    if (raw.length !== 15) return { status: 'invalid', reason: 'length', stateCode: '', entityCode: '', expected: '' };
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(raw)) {
      return { status: 'invalid', reason: 'pattern', stateCode: '', entityCode: '', expected: '' };
    }
    const stateCode = raw.slice(0, 2);
    if (!this.stateCodes.includes(stateCode)) {
      return { status: 'invalid', reason: 'state', stateCode, entityCode: '', expected: '' };
    }
    if (!this.holderCodes.includes(raw[5])) {
      return { status: 'invalid', reason: 'panHolder', stateCode, entityCode: '', expected: '' };
    }
    const entityCode = raw[12];
    const expected = GstinValidatorComponent.checkChar(raw.slice(0, 14));
    if (raw[14] !== expected) {
      return { status: 'invalid', reason: 'checksum', stateCode, entityCode, expected };
    }
    return { status: 'valid', reason: '', stateCode, entityCode, expected };
  });

  readonly breakdown = computed(() => {
    const a = this.analysis();
    if (a.status !== 'valid') return null;
    const raw = this.cleaned();
    return {
      state: a.stateCode + ' - ' + this.t('states.' + a.stateCode),
      pan: raw.slice(2, 12),
      entity: raw[12],
      check: raw[14],
    };
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

  setGstin(v: string) { this.gstin.set((v ?? '').slice(0, 17)); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
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
