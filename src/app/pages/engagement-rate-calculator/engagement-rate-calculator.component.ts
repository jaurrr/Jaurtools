import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-engagement-rate-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './engagement-rate-calculator.component.html',
  styleUrl: './engagement-rate-calculator.component.scss',
})
export class EngagementRateCalculatorComponent implements OnDestroy {
  readonly slug = 'engagement-rate-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['influencer-cost-calculator', 'roas-calculator', 'marketing-budget-calculator', 'lead-scoring-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly likes = signal(1200);
  readonly comments = signal(150);
  readonly shares = signal(80);
  readonly saves = signal(60);
  readonly followers = signal(25000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly totalInteractions = computed(() =>
    this.likes() + this.comments() + this.shares() + this.saves()
  );

  readonly engagementRate = computed(() => {
    const f = this.followers();
    if (f <= 0) return 0;
    return (this.totalInteractions() / f) * 100;
  });

  readonly metrics = computed(() => {
    const f = this.followers();
    const vals: Record<string, number> = {
      likes: this.likes(), comments: this.comments(), shares: this.shares(), saves: this.saves(),
    };
    return Object.keys(vals).map((key) => ({
      key,
      value: vals[key],
      pct: f > 0 ? (vals[key] / f) * 100 : 0,
    }));
  });

  readonly verdict = computed(() => {
    if (this.followers() <= 0) return 'na';
    const r = this.engagementRate();
    if (r < 1) return 'low';
    if (r < 3) return 'average';
    if (r < 6) return 'good';
    return 'excellent';
  });

  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  readonly zeroDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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

  setLikes(v: number) { this.likes.set(this.clampNum(v, 0, 1000000000)); }
  setComments(v: number) { this.comments.set(this.clampNum(v, 0, 1000000000)); }
  setShares(v: number) { this.shares.set(this.clampNum(v, 0, 1000000000)); }
  setSaves(v: number) { this.saves.set(this.clampNum(v, 0, 1000000000)); }
  setFollowers(v: number) { this.followers.set(this.clampNum(v, 0, 1000000000)); }

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
