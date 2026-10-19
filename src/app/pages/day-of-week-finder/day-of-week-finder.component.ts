import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-day-of-week-finder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './day-of-week-finder.component.html',
  styleUrl: './day-of-week-finder.component.scss',
})
export class DayOfWeekFinderComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.weekdayText());
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

  readonly slug = 'day-of-week-finder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['days-between-dates', 'date-calculator', 'birthday-calculator', 'add-to-a-date'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly date = signal('2026-10-18');

  readonly info = computed(() => {
    const d = this.parseLocalDate(this.date());
    if (!d) return null;
    const start = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.round((d.getTime() - start.getTime()) / 86400000) + 1;
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (utc.getUTCDay() + 6) % 7;
    utc.setUTCDate(utc.getUTCDate() - dayNum + 3);
    const firstThu = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
    const fNum = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - fNum + 3);
    const isoWeek = 1 + Math.round((utc.getTime() - firstThu.getTime()) / (7 * 86400000));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromToday = Math.round((d.getTime() - today.getTime()) / 86400000);
    const dow = d.getDay();
    return { weekday: this.fmtWeekday(d), weekend: dow === 0 || dow === 6, dayOfYear, isoWeek, fromToday };
  });
  readonly weekdayText = computed(() => this.info()?.weekday ?? '');
  readonly weekendText = computed(() => {
    const i = this.info();
    if (!i) return '';
    return i.weekend ? this.t('labels.yes') : this.t('labels.no');
  });
  readonly dayOfYearText = computed(() => {
    const i = this.info();
    return i ? new Intl.NumberFormat(this.locale()).format(i.dayOfYear) : '';
  });
  readonly isoWeekText = computed(() => {
    const i = this.info();
    return i ? new Intl.NumberFormat(this.locale()).format(i.isoWeek) : '';
  });
  readonly fromTodayText = computed(() => {
    const i = this.info();
    if (!i) return '';
    return new Intl.NumberFormat(this.locale(), { signDisplay: 'exceptZero' }).format(i.fromToday);
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

  setDate(v: string) { this.date.set(v); }
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
