import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-days-between-dates',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './days-between-dates.component.html',
  styleUrl: './days-between-dates.component.scss',
})
export class DaysBetweenDatesComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.daysText());
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

  readonly slug = 'days-between-dates';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['date-calculator', 'day-of-week-finder', 'age-difference-calculator', 'online-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly startInput = signal('2026-10-18T09:00');
  readonly endInput = signal('2026-10-25T17:30');
  readonly includeEnd = signal(false);

  private parseDateTime(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return isNaN(d.getTime()) ? null : d;
  }
  private businessDays(a: Date, b: Date, includeEnd: boolean): number {
    const dayMs = 86400000;
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    const days = Math.round((end.getTime() - start.getTime()) / dayMs);
    const fullWeeks = Math.floor(days / 7);
    let n = fullWeeks * 5;
    const startDow = start.getDay();
    for (let i = 0; i < days % 7; i++) {
      const dow = (startDow + i) % 7;
      if (dow !== 0 && dow !== 6) n++;
    }
    if (includeEnd) {
      const dow = end.getDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }
  readonly span = computed(() => {
    const s = this.parseDateTime(this.startInput());
    const e = this.parseDateTime(this.endInput());
    if (!s || !e) return null;
    const early = s.getTime() <= e.getTime() ? s : e;
    const late = s.getTime() <= e.getTime() ? e : s;
    const ms = late.getTime() - early.getTime();
    return {
      days: ms / 86400000,
      hours: ms / 3600000,
      minutes: ms / 60000,
      seconds: ms / 1000,
      business: this.businessDays(early, late, this.includeEnd()),
    };
  });
  private fmtNum(v: number, frac: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: frac }).format(v);
  }
  readonly daysText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.days, 2) : '';
  });
  readonly hoursText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.hours, 2) : '';
  });
  readonly minutesText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.minutes, 1) : '';
  });
  readonly secondsText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.seconds, 0) : '';
  });
  readonly businessText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.business, 0) : '';
  });
  readonly weeksText = computed(() => {
    const s = this.span();
    return s ? this.fmtNum(s.days / 7, 2) : '';
  });
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
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

  setStartInput(v: string) { this.startInput.set(v); }
  setEndInput(v: string) { this.endInput.set(v); }
  setIncludeEnd(v: boolean) { this.includeEnd.set(v); }
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
  private parseLocalDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  private fmtDate(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'full' }).format(d);
  }
  private fmtWeekday(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long' }).format(d);
  }
  private isoDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
