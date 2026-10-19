import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sun-position-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sun-position-calculator.component.html',
  styleUrl: './sun-position-calculator.component.scss',
})
export class SunPositionCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.zenith()) + "\u00b0");
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

  readonly slug = 'sun-position-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['qibla-direction-finder', 'wind-chill-calculator', 'zodiac-sign-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly dateStr = signal('2026-06-21');
  readonly timeStr = signal('12:00');
  readonly utcOffset = signal(0);
  readonly lat = signal(51.5);
  readonly lon = signal(0);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly solar = computed(() => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const parts = this.dateStr().split('-').map(Number);
    const tparts = this.timeStr().split(':').map(Number);
    if (parts.length !== 3 || tparts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
      return null;
    }
    const [year, month, day] = parts;
    const [hh, mm] = tparts;
    const utcMs = Date.UTC(year, month - 1, day, hh, mm) - this.utcOffset() * 3600000;
    const utc = new Date(utcMs);
    if (Number.isNaN(utc.getTime())) return null;
    const startOfYear = Date.UTC(utc.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor((utc.getTime() - startOfYear) / 86400000);
    const hourUtc = utc.getUTCHours() + utc.getUTCMinutes() / 60;

    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUtc - 12) / 24);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const timeOffset = eqtime + 4 * this.lon() - 60 * this.utcOffset();
    const tst = hourUtc * 60 + this.utcOffset() * 60 + timeOffset;
    const ha = toRad(tst / 4 - 180);
    const latR = toRad(this.lat());
    const cosZenith = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    const zenith = toDeg(Math.acos(Math.min(1, Math.max(-1, cosZenith))));
    const elevation = 90 - zenith;
    return { zenith, elevation, declination: toDeg(decl), eqtime };
  });

  readonly zenith = computed(() => this.solar()?.zenith ?? 0);
  readonly elevation = computed(() => this.solar()?.elevation ?? -90);
  readonly declination = computed(() => this.solar()?.declination ?? 0);
  readonly valid = computed(() => this.solar() !== null);

  readonly dayState = computed(() => {
    const e = this.elevation();
    if (e > 0) return 'day';
    if (e > -6) return 'civilTwilight';
    if (e > -12) return 'nauticalTwilight';
    if (e > -18) return 'astronomicalTwilight';
    return 'night';
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  setDate(v: string) { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) this.dateStr.set(v); }
  setTime(v: string) { if (/^\d{2}:\d{2}$/.test(v)) this.timeStr.set(v); }
  setUtcOffset(v: number) { this.utcOffset.set(this.clampNum(v, -12, 14)); }
  setLat(v: number) { this.lat.set(this.clampNum(v, -90, 90)); }
  setLon(v: number) { this.lon.set(this.clampNum(v, -180, 180)); }

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
