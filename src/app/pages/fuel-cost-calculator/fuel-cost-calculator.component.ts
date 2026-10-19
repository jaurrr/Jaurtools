import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-fuel-cost-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './fuel-cost-calculator.component.html',
  styleUrl: './fuel-cost-calculator.component.scss',
})
export class FuelCostCalculatorComponent implements OnDestroy {
  readonly slug = 'fuel-cost-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['forex-compounding-calculator', 'percentage-calculator', 'unit-converter', 'future-value-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'fuel' | 'trip'>('fuel');
  readonly distanceKm = signal(500);
  readonly efficiency = signal(15);
  readonly fuelPrice = signal(100);
  readonly toll = signal(800);
  readonly food = signal(1200);
  readonly stay = signal(2000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const fuelNeeded = this.efficiency() > 0 ? this.distanceKm() / this.efficiency() : 0;
    const fuelCost = fuelNeeded * this.fuelPrice();
    const extras = this.toll() + this.food() + this.stay();
    const tripTotal = fuelCost + extras;
    const perKm = this.distanceKm() > 0 ? tripTotal / this.distanceKm() : 0;
    return { fuelNeeded, fuelCost, extras, tripTotal, perKm };
  });

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    })
  );

  readonly num = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 })
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

  setMode(m: 'fuel' | 'trip') { this.mode.set(m); }
  setDistanceKm(v: number) { this.distanceKm.set(this.clampNum(v, 1, 20000)); }
  setEfficiency(v: number) { this.efficiency.set(this.clampNum(v, 1, 100)); }
  setFuelPrice(v: number) { this.fuelPrice.set(this.clampNum(v, 1, 1000)); }
  setToll(v: number) { this.toll.set(this.clampNum(v, 0, 100000)); }
  setFood(v: number) { this.food.set(this.clampNum(v, 0, 100000)); }
  setStay(v: number) { this.stay.set(this.clampNum(v, 0, 500000)); }

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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
