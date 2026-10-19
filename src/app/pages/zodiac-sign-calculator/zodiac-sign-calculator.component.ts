import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface SignDef {
  key: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

// Ordered by start date; Capricorn wraps the year end.
const SIGNS: SignDef[] = [
  { key: 'capricorn', startMonth: 12, startDay: 22, endMonth: 1, endDay: 19 },
  { key: 'aquarius', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18 },
  { key: 'pisces', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20 },
  { key: 'aries', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19 },
  { key: 'taurus', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20 },
  { key: 'gemini', startMonth: 5, startDay: 21, endMonth: 6, endDay: 20 },
  { key: 'cancer', startMonth: 6, startDay: 21, endMonth: 7, endDay: 22 },
  { key: 'leo', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22 },
  { key: 'virgo', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22 },
  { key: 'libra', startMonth: 9, startDay: 23, endMonth: 10, endDay: 22 },
  { key: 'scorpio', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21 },
  { key: 'sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21 },
];

@Component({
  selector: 'app-zodiac-sign-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './zodiac-sign-calculator.component.html',
  styleUrl: './zodiac-sign-calculator.component.scss',
})
export class ZodiacSignCalculatorComponent implements OnDestroy {
  readonly slug = 'zodiac-sign-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['qibla-direction-finder', 'sun-position-calculator', 'online-whiteboard'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly day = signal(15);
  readonly month = signal(4);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly maxDay = computed(() => new Date(2024, this.month(), 0).getDate());

  readonly sign = computed<SignDef>(() => {
    const m = this.month();
    const d = Math.min(this.day(), this.maxDay());
    for (const s of SIGNS) {
      const afterStart = m > s.startMonth || (m === s.startMonth && d >= s.startDay);
      const beforeEnd = m < s.endMonth || (m === s.endMonth && d <= s.endDay);
      if (s.startMonth > s.endMonth) {
        if (afterStart || beforeEnd) return s;
      } else if (afterStart && beforeEnd) {
        return s;
      }
    }
    return SIGNS[0];
  });

  signText(path: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(
      `${this.slug}.labels.signs.${this.sign().key}.${path}`
    );
    return typeof raw === 'string' ? raw : '';
  }

  signList(path: string): string[] {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(
      `${this.slug}.labels.signs.${this.sign().key}.${path}`
    );
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  readonly months = computed(() => {
    this.translate.lang();
    const raw = this.lookup('labels.monthNames');
    return Array.isArray(raw) ? (raw as string[]) : [];
  });

  setDay(v: number) { this.day.set(this.clampInt(v, 1, 31)); }
  setMonth(v: number) { this.month.set(this.clampInt(v, 1, 12)); }

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

  private clampInt(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
