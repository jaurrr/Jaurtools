import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';


@Component({
  selector: 'app-time-unit-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './time-unit-converter.component.html',
  styleUrl: './time-unit-converter.component.scss',
})
export class TimeUnitConverterComponent implements OnDestroy {
  readonly slug = 'time-unit-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['speed-converter', 'length-converter', 'weight-converter', 'temperature-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly value = signal(1);
  readonly fromUnit = signal('hr');
  readonly toUnit = signal('min');

  private readonly factors: Record<string, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
  hr: 3600,
  day: 86400,
  week: 604800,
  month: 2629800,
  year: 31557600
};

  readonly unitOptions = computed(() => {
    this.translate.lang();
    const raw = this.lookup('units');
    return Array.isArray(raw) ? (raw as { id: string; name: string; symbol: string }[]) : [];
  });

  readonly converted = computed(() => {
    const f = this.factors[this.fromUnit()];
    const tg = this.factors[this.toUnit()];
    const v = this.value();
    if (!f || !tg || !Number.isFinite(v)) return 0;
    return (v * f) / tg;
  });

  readonly rate = computed(() => {
    const f = this.factors[this.fromUnit()];
    const tg = this.factors[this.toUnit()];
    if (!f || !tg) return 0;
    return f / tg;
  });

  readonly formatter = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 6 })
  );

  unitSymbol(id: string): string {
    return this.unitOptions().find((u) => u.id === id)?.symbol ?? id;
  }

  unitName(id: string): string {
    return this.unitOptions().find((u) => u.id === id)?.name ?? id;
  }

  setValue(v: number) {
    this.value.set(this.clampNum(v, -1e15, 1e15));
  }

  swap() {
    const a = this.fromUnit();
    this.fromUnit.set(this.toUnit());
    this.toUnit.set(a);
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

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
