import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';


@Component({
  selector: 'app-temperature-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './temperature-converter.component.html',
  styleUrl: './temperature-converter.component.scss',
})
export class TemperatureConverterComponent implements OnDestroy {
  readonly slug = 'temperature-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['length-converter', 'speed-converter', 'weight-converter', 'time-unit-converter'];

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

  readonly celsius = signal(25);
  readonly fahrenheit = signal(77);
  readonly kelvin = signal(298.15);

  readonly references = computed(() => {
    this.translate.lang();
    const raw = this.lookup('referencePoints');
    return Array.isArray(raw)
      ? (raw as { label: string; c: number; f: number; k: number }[])
      : [];
  });

  readonly formatter = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
  );

  setC(v: number) {
    if (!Number.isFinite(v)) return;
    const c = this.clampNum(v, -273.15, 1e6);
    this.celsius.set(c);
    this.fahrenheit.set(this.clampNum((c * 9) / 5 + 32, -459.67, 1e6));
    this.kelvin.set(this.clampNum(c + 273.15, 0, 1e6));
  }

  setF(v: number) {
    if (!Number.isFinite(v)) return;
    const f = this.clampNum(v, -459.67, 1e6);
    this.fahrenheit.set(f);
    this.celsius.set(this.clampNum(((f - 32) * 5) / 9, -273.15, 1e6));
    this.kelvin.set(this.clampNum(((f - 32) * 5) / 9 + 273.15, 0, 1e6));
  }

  setK(v: number) {
    if (!Number.isFinite(v)) return;
    const k = this.clampNum(v, 0, 1e6);
    this.kelvin.set(k);
    this.celsius.set(this.clampNum(k - 273.15, -273.15, 1e6));
    this.fahrenheit.set(this.clampNum(((k - 273.15) * 9) / 5 + 32, -459.67, 1e6));
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
