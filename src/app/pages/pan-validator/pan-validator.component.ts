import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-pan-validator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pan-validator.component.html',
  styleUrl: './pan-validator.component.scss',
})
export class PanValidatorComponent implements OnDestroy {
  readonly slug = 'pan-validator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['gstin-validator', 'aadhaar-validator', 'emi-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pan = signal('ABCPE1234F');

  private readonly holderCodes = ['C', 'P', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'];

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly cleaned = computed(() => this.pan().trim().toUpperCase());

  readonly analysis = computed(() => {
    const raw = this.cleaned();
    if (!raw) return { status: 'empty', reason: '', holder: '' };
    if (raw.length !== 10) return { status: 'invalid', reason: 'length', holder: '' };
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(raw)) return { status: 'invalid', reason: 'pattern', holder: '' };
    const h = raw[3];
    if (!this.holderCodes.includes(h)) return { status: 'invalid', reason: 'holder', holder: '' };
    return { status: 'valid', reason: '', holder: h };
  });

  readonly isValid = computed(() => this.analysis().status === 'valid');

  readonly parts = computed(() => {
    const raw = this.cleaned();
    if (this.analysis().status !== 'valid') return null;
    return {
      serial: raw.slice(0, 3),
      holderCode: raw[3],
      surnameInitial: raw[4],
      sequence: raw.slice(5, 9),
      checkChar: raw[9],
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

  setPan(v: string) { this.pan.set((v ?? '').slice(0, 12)); }

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
