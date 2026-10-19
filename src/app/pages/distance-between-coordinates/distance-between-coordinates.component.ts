import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-distance-between-coordinates',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './distance-between-coordinates.component.html',
  styleUrl: './distance-between-coordinates.component.scss',
})
export class DistanceBetweenCoordinatesComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.distanceKm()));
  copyMain(): void {
    const text = this.copyText();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'distance-between-coordinates';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['density-calculator', 'bandwidth-calculator', 'cbm-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly lat1 = signal(40.7128);
  readonly lon1 = signal(-74.006);
  readonly lat2 = signal(51.5074);
  readonly lon2 = signal(-0.1278);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly radians = computed(() => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    return {
      lat1: toRad(this.lat1()),
      lon1: toRad(this.lon1()),
      lat2: toRad(this.lat2()),
      lon2: toRad(this.lon2()),
    };
  });

  readonly distanceKm = computed(() => {
    const r = this.radians();
    if (![this.lat1(), this.lon1(), this.lat2(), this.lon2()].every(Number.isFinite)) return 0;
    const dLat = r.lat2 - r.lat1;
    const dLon = r.lon2 - r.lon1;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(r.lat1) * Math.cos(r.lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
  });

  readonly distanceMi = computed(() => this.distanceKm() / 1.609344);
  readonly distanceM = computed(() => this.distanceKm() * 1000);

  readonly valid = computed(() =>
    Math.abs(this.lat1()) <= 90 &&
    Math.abs(this.lat2()) <= 90 &&
    Math.abs(this.lon1()) <= 180 &&
    Math.abs(this.lon2()) <= 180
  );

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );
  readonly noDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
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

  setLat1(v: number) { this.lat1.set(this.clampNum(v, -90, 90)); }
  setLon1(v: number) { this.lon1.set(this.clampNum(v, -180, 180)); }
  setLat2(v: number) { this.lat2.set(this.clampNum(v, -90, 90)); }
  setLon2(v: number) { this.lon2.set(this.clampNum(v, -180, 180)); }

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
