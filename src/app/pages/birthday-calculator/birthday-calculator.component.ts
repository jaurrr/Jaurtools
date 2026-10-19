import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-birthday-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './birthday-calculator.component.html',
  styleUrl: './birthday-calculator.component.scss',
})
export class BirthdayCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.ageText());
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

  readonly slug = 'birthday-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['age-difference-calculator', 'online-timer', 'day-of-week-finder', 'online-stopwatch'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly birthdate = signal('2000-03-10');

  private today(): Date {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }
  private isLeap(y: number): boolean {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }
  private birthdayInYear(b: Date, y: number): Date {
    let d = b.getDate();
    if (b.getMonth() === 1 && d === 29 && !this.isLeap(y)) d = 28;
    return new Date(y, b.getMonth(), d);
  }

  readonly age = computed(() => {
    const b = this.parseLocalDate(this.birthdate());
    if (!b) return null;
    const t = this.today();
    if (b.getTime() > t.getTime()) return null;
    let years = t.getFullYear() - b.getFullYear();
    let months = t.getMonth() - b.getMonth();
    let days = t.getDate() - b.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(t.getFullYear(), t.getMonth(), 0).getDate();
    }
    if (months < 0) { years -= 1; months += 12; }
    return { years, months, days };
  });
  readonly ageText = computed(() => {
    const a = this.age();
    if (!a) return '';
    const f = new Intl.NumberFormat(this.locale());
    return `${f.format(a.years)} ${this.t('labels.years')}, ${f.format(a.months)} ${this.t('labels.months')}, ${f.format(a.days)} ${this.t('labels.days')}`;
  });
  readonly nextBirthday = computed(() => {
    const b = this.parseLocalDate(this.birthdate());
    if (!b) return null;
    const t = this.today();
    if (b.getTime() > t.getTime()) return null;
    let cand = this.birthdayInYear(b, t.getFullYear());
    if (cand.getTime() < t.getTime()) cand = this.birthdayInYear(b, t.getFullYear() + 1);
    return cand;
  });
  readonly daysUntil = computed(() => {
    const n = this.nextBirthday();
    if (!n) return '';
    const days = Math.round((n.getTime() - this.today().getTime()) / 86400000);
    return new Intl.NumberFormat(this.locale()).format(days);
  });
  readonly nextBirthdayText = computed(() => {
    const n = this.nextBirthday();
    return n ? this.fmtDate(n) : '';
  });
  readonly nextWeekday = computed(() => {
    const n = this.nextBirthday();
    return n ? this.fmtWeekday(n) : '';
  });
  readonly bornWeekday = computed(() => {
    const b = this.parseLocalDate(this.birthdate());
    return b ? this.fmtWeekday(b) : '';
  });
  readonly dayOfYear = computed(() => {
    const b = this.parseLocalDate(this.birthdate());
    if (!b) return '';
    const start = new Date(b.getFullYear(), 0, 1);
    const n = Math.round((b.getTime() - start.getTime()) / 86400000) + 1;
    return new Intl.NumberFormat(this.locale()).format(n);
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

  setBirthdate(v: string) { this.birthdate.set(v); }
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
