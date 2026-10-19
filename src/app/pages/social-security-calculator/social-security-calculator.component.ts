import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

// Simplified US Social Security estimate. 2025 bend points: $1,226 and $7,391.
// Adjustment factors assume full retirement age 67.
const CLAIM_ADJUSTMENTS: Record<number, number> = {
  62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667, 66: 0.9333,
  67: 1.0, 68: 1.08, 69: 1.16, 70: 1.24,
};

@Component({
  selector: 'app-social-security-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './social-security-calculator.component.html',
  styleUrl: './social-security-calculator.component.scss',
})
export class SocialSecurityCalculatorComponent implements OnDestroy {
  readonly slug = 'social-security-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['retirement-calculator', 'roth-ira-calculator', 'rmd-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly aime = signal(4000);
  readonly claimAge = signal(67);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly pia = computed(() => {
    const a = this.aime();
    const b1 = 1226;
    const b2 = 7391;
    const part1 = 0.9 * Math.min(a, b1);
    const part2 = 0.32 * Math.min(Math.max(a - b1, 0), b2 - b1);
    const part3 = 0.15 * Math.max(a - b2, 0);
    return part1 + part2 + part3;
  });

  readonly adjustment = computed(() => CLAIM_ADJUSTMENTS[this.claimAge()] ?? 1);

  readonly monthlyBenefit = computed(() => this.pia() * this.adjustment());
  readonly annualBenefit = computed(() => this.monthlyBenefit() * 12);

  readonly money2 = computed(
    () => new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  );
  readonly money0 = computed(
    () => new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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

  setAime(v: number) { this.aime.set(this.clampNum(v, 0, 20000)); }
  setClaimAge(v: number) { this.claimAge.set(Math.round(this.clampNum(v, 62, 70))); }

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
