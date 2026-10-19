import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Moscow',
  'Africa/Cairo',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
];

const DEFAULTS = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'America/New_York'];

@Component({
  selector: 'app-world-clock',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './world-clock.component.html',
  styleUrl: './world-clock.component.scss',
})
export class WorldClockComponent implements OnDestroy {
  readonly slug = 'world-clock';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['time-zone-converter', 'sunrise-sunset-calculator', 'online-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly zones = ZONES;
  readonly selected = signal<string[]>([...DEFAULTS]);
  readonly addZoneId = signal('');

  private readonly tick = signal(0);
  private timerId: ReturnType<typeof setInterval> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.timerId = setInterval(() => this.tick.update((v) => v + 1), 1000);
  }

  readonly localClock = computed(() => {
    this.tick();
    this.translate.lang();
    const now = new Date();
    return {
      time: new Intl.DateTimeFormat(this.locale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now),
      date: new Intl.DateTimeFormat(this.locale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now),
    };
  });

  readonly clocks = computed(() => {
    this.tick();
    this.translate.lang();
    const locale = this.locale();
    const now = new Date();
    return this.selected().map((tz) => {
      const hour = +new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(now) % 24;
      return {
        tz,
        name: this.zoneName(tz),
        time: new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now),
        date: new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(now),
        offset: this.fmtOffset(this.offsetMinutes(now, tz)),
        isDay: hour >= 6 && hour < 18,
      };
    });
  });

  readonly availableZones = computed(() => this.zones.filter((z) => !this.selected().includes(z)));

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

  zoneName(id: string): string {
    this.translate.lang();
    const names = this.list('labels.zoneNames');
    const idx = ZONES.indexOf(id);
    return idx >= 0 && idx < names.length ? names[idx] : id;
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setAddZone(v: string) { this.addZoneId.set(v ?? ''); }

  addCity() {
    const z = this.addZoneId();
    if (z && ZONES.includes(z) && !this.selected().includes(z)) {
      this.selected.update((s) => [...s, z]);
      this.addZoneId.set('');
    }
  }

  removeCity(tz: string) {
    this.selected.update((s) => s.filter((x) => x !== tz));
  }

  ngOnDestroy() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private offsetMinutes(date: Date, tz: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
    const asUTC = Date.UTC(
      +parts['year'],
      +parts['month'] - 1,
      +parts['day'],
      (+parts['hour'] % 24),
      +parts['minute'],
      +parts['second']
    );
    return (asUTC - date.getTime()) / 60000;
  }

  private fmtOffset(mins: number): string {
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(Math.round(mins));
    const h = Math.floor(a / 60);
    const m = a % 60;
    return `UTC${sign}${h}` + (m ? `:${`${m}`.padStart(2, '0')}` : '');
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
