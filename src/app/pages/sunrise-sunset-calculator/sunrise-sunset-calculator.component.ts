import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Preset {
  id: string;
  lat: number;
  lon: number;
}

const PRESETS: Preset[] = [
  { id: 'delhi', lat: 28.6139, lon: 77.209 },
  { id: 'mumbai', lat: 19.076, lon: 72.8777 },
  { id: 'riyadh', lat: 24.7136, lon: 46.6753 },
  { id: 'dubai', lat: 25.2048, lon: 55.2708 },
  { id: 'london', lat: 51.5074, lon: -0.1278 },
  { id: 'newyork', lat: 40.7128, lon: -74.006 },
  { id: 'sydney', lat: -33.8688, lon: 151.2093 },
  { id: 'cairo', lat: 30.0444, lon: 31.2357 },
];

const ZENITH = 90.833;

@Component({
  selector: 'app-sunrise-sunset-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sunrise-sunset-calculator.component.html',
  styleUrl: './sunrise-sunset-calculator.component.scss',
})
export class SunriseSunsetCalculatorComponent implements OnDestroy {
  readonly slug = 'sunrise-sunset-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['time-zone-converter', 'world-clock'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly presetIds = PRESETS.map((p) => p.id);
  readonly presetId = signal('delhi');
  readonly lat = signal(28.6139);
  readonly lon = signal(77.209);
  readonly dateStr = signal(this.todayLocal());

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const lat = this.lat();
    const lon = this.lon();
    const d = this.parseDate(this.dateStr());
    if (!d || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { ok: false as const };
    }
    const sun = this.solarTimes(lat, lon, d.y, d.m, d.day);
    if (!sun.ok) {
      return {
        ok: true as const,
        polar: sun.polar as 'day' | 'night' | null,
        sunrise: '',
        sunset: '',
        solarNoon: '',
        dayHours: 0,
        dayMinutes: 0,
      };
    }
    const dayLenMin = Math.round(sun.dayLenH * 60);
    return {
      ok: true as const,
      polar: null as 'day' | 'night' | null,
      sunrise: this.fmtTime(sun.riseH, d),
      sunset: this.fmtTime(sun.setH, d),
      solarNoon: this.fmtTime(sun.noonH, d),
      dayHours: Math.floor(dayLenMin / 60),
      dayMinutes: dayLenMin % 60,
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

  presetName(id: string): string {
    this.translate.lang();
    const names = this.list('labels.presetNames');
    const idx = this.presetIds.indexOf(id);
    return idx >= 0 && idx < names.length ? names[idx] : id;
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setPreset(id: string) {
    this.presetId.set(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      this.lat.set(p.lat);
      this.lon.set(p.lon);
    }
  }

  setLat(v: number) {
    this.lat.set(this.clampNum(v, -90, 90));
    this.presetId.set('custom');
  }

  setLon(v: number) {
    this.lon.set(this.clampNum(v, -180, 180));
    this.presetId.set('custom');
  }

  setDate(v: string) {
    this.dateStr.set(v ?? '');
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private todayLocal(): string {
    const n = new Date();
    const m = `${n.getMonth() + 1}`.padStart(2, '0');
    const d = `${n.getDate()}`.padStart(2, '0');
    return `${n.getFullYear()}-${m}-${d}`;
  }

  private parseDate(v: string): { y: number; m: number; day: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
    if (!m) return null;
    const y = +m[1];
    const mo = +m[2];
    const day = +m[3];
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
    const check = new Date(y, mo - 1, day);
    if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== day) return null;
    return { y, m: mo, day };
  }

  private solarTimes(lat: number, lon: number, y: number, mo: number, day: number) {
    const rad = (d: number) => (d * Math.PI) / 180;
    const deg = (r: number) => (r * 180) / Math.PI;
    const norm360 = (d: number) => ((d % 360) + 360) % 360;
    const norm24 = (h: number) => ((h % 24) + 24) % 24;
    const doy = Math.floor((Date.UTC(y, mo - 1, day) - Date.UTC(y, 0, 0)) / 86400000);
    const lngHour = lon / 15;
    const one = (h0: number, rising: boolean): number | null => {
      const t = doy + (h0 - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      let L = norm360(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634);
      let RA = norm360(deg(Math.atan(0.91764 * Math.tan(rad(L)))));
      RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
      RA /= 15;
      const sinDec = 0.39782 * Math.sin(rad(L));
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
      if (cosH > 1 || cosH < -1) return null;
      let H = rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH));
      H /= 15;
      return norm24(H + RA - 0.06571 * t - 6.622 - lngHour);
    };
    const riseH = one(6, true);
    const setH = one(18, false);
    if (riseH === null || setH === null) {
      const cosHnoon = this.cosHAtNoon(lat, lon, y, mo, day);
      return { ok: false, polar: cosHnoon < -1 ? 'day' : 'night' } as const;
    }
    const dayLenH = norm24(setH - riseH);
    return { ok: true as const, riseH, setH, noonH: norm24(riseH + dayLenH / 2), dayLenH };
  }

  private cosHAtNoon(lat: number, lon: number, y: number, mo: number, day: number): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const norm360 = (d: number) => ((d % 360) + 360) % 360;
    const doy = Math.floor((Date.UTC(y, mo - 1, day) - Date.UTC(y, 0, 0)) / 86400000);
    const t = doy + (12 - lon / 15) / 24;
    const M = 0.9856 * t - 3.289;
    const L = norm360(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634);
    const sinDec = 0.39782 * Math.sin(rad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    return (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  }

  private fmtTime(utHours: number, d: { y: number; m: number; day: number }): string {
    const ms = Date.UTC(d.y, d.m - 1, d.day) + utHours * 3600000;
    return new Intl.DateTimeFormat(this.locale(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(ms));
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
