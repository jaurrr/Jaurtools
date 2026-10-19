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

@Component({
  selector: 'app-time-zone-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './time-zone-converter.component.html',
  styleUrl: './time-zone-converter.component.scss',
})
export class TimeZoneConverterComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.result().toDateTime);
  copyMain(): void {
    const text = String(this.copyText());
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

  readonly slug = 'time-zone-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['world-clock', 'sunrise-sunset-calculator', 'time-duration-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly zones = ZONES;
  readonly dateStr = signal(this.todayLocal());
  readonly timeStr = signal('12:00');
  readonly fromZone = signal('Asia/Kolkata');
  readonly toZone = signal('America/New_York');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly result = computed(() => {
    const d = this.parseDate(this.dateStr());
    const tm = this.parseTime(this.timeStr());
    const from = this.fromZone();
    const to = this.toZone();
    if (!d || !tm || !ZONES.includes(from) || !ZONES.includes(to)) {
      return { ok: false as const };
    }
    const utcMs = this.zonedToUtc(d.y, d.m, d.day, tm.h, tm.mi, from);
    const dtf = (tz: string) =>
      new Intl.DateTimeFormat(this.locale(), {
        timeZone: tz,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(utcMs));
    const fromOff = this.offsetMinutes(new Date(utcMs), from);
    const toOff = this.offsetMinutes(new Date(utcMs), to);
    const diffMin = Math.round(toOff - fromOff);
    return {
      ok: true as const,
      fromLabel: this.zoneName(from),
      toLabel: this.zoneName(to),
      fromDateTime: dtf(from),
      toDateTime: dtf(to),
      fromOffset: this.fmtOffset(fromOff),
      toOffset: this.fmtOffset(toOff),
      diffText: this.fmtDiff(diffMin),
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

  setDate(v: string) { this.dateStr.set(v ?? ''); }
  setTime(v: string) { this.timeStr.set(v ?? ''); }
  setFrom(v: string) { this.fromZone.set(v); }
  setTo(v: string) { this.toZone.set(v); }

  swap() {
    const f = this.fromZone();
    this.fromZone.set(this.toZone());
    this.toZone.set(f);
  }

  ngOnDestroy() {
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

  private zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
    let utc = Date.UTC(y, mo - 1, d, h, mi);
    for (let i = 0; i < 3; i++) {
      utc = Date.UTC(y, mo - 1, d, h, mi) - this.offsetMinutes(new Date(utc), tz) * 60000;
    }
    return utc;
  }

  private fmtOffset(mins: number): string {
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(Math.round(mins));
    const h = Math.floor(a / 60);
    const m = a % 60;
    return `UTC${sign}${h}` + (m ? `:${`${m}`.padStart(2, '0')}` : '');
  }

  private fmtDiff(diffMin: number): string {
    if (diffMin === 0) return this.t('labels.sameOffset');
    const a = Math.abs(diffMin);
    const h = Math.floor(a / 60);
    const m = a % 60;
    const dur = h && m
      ? `${h} ${this.t('labels.hoursShort')} ${m} ${this.t('labels.minutesShort')}`
      : h
        ? `${h} ${this.t('labels.hoursShort')}`
        : `${m} ${this.t('labels.minutesShort')}`;
    return dur + ' ' + (diffMin > 0 ? this.t('labels.ahead') : this.t('labels.behind'));
  }

  private todayLocal(): string {
    const n = new Date();
    return `${n.getFullYear()}-${`${n.getMonth() + 1}`.padStart(2, '0')}-${`${n.getDate()}`.padStart(2, '0')}`;
  }

  private parseDate(v: string): { y: number; m: number; day: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
    if (!m) return null;
    const y = +m[1];
    const mo = +m[2];
    const day = +m[3];
    const check = new Date(y, mo - 1, day);
    if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== day) return null;
    return { y, m: mo, day };
  }

  private parseTime(v: string): { h: number; mi: number } | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { h: +m[1], mi: +m[2] };
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
