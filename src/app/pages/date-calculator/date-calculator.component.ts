import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-date-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './date-calculator.component.html',
  styleUrl: './date-calculator.component.scss',
})
export class DateCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.shiftedText());
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

  readonly slug = 'date-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['add-to-a-date', 'subtract-from-a-date', 'days-between-dates', 'day-of-week-finder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'addsub' | 'diff'>('addsub');
  readonly date = signal('2026-10-18');
  readonly days = signal(90);
  readonly dateA = signal('2026-10-18');
  readonly dateB = signal('2027-01-01');

  readonly shifted = computed(() => {
    const d = this.parseLocalDate(this.date());
    if (!d) return null;
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() + Math.trunc(this.days()));
    return r;
  });
  readonly shiftedText = computed(() => {
    const r = this.shifted();
    return r ? this.fmtDate(r) : '';
  });
  readonly shiftedWeekday = computed(() => {
    const r = this.shifted();
    return r ? this.fmtWeekday(r) : '';
  });
  readonly gap = computed(() => {
    const a = this.parseLocalDate(this.dateA());
    const b = this.parseLocalDate(this.dateB());
    if (!a || !b) return null;
    const early = a.getTime() <= b.getTime() ? a : b;
    const late = a.getTime() <= b.getTime() ? b : a;
    const totalDays = Math.round((late.getTime() - early.getTime()) / 86400000);
    let years = late.getFullYear() - early.getFullYear();
    let months = late.getMonth() - early.getMonth();
    let dys = late.getDate() - early.getDate();
    if (dys < 0) {
      months -= 1;
      dys += new Date(late.getFullYear(), late.getMonth(), 0).getDate();
    }
    if (months < 0) { years -= 1; months += 12; }
    return { totalDays, years, months, days: dys };
  });
  readonly gapDaysText = computed(() => {
    const g = this.gap();
    return g ? new Intl.NumberFormat(this.locale()).format(g.totalDays) : '';
  });
  readonly gapWeeksText = computed(() => {
    const g = this.gap();
    if (!g) return '';
    const f = new Intl.NumberFormat(this.locale());
    return `${f.format(Math.floor(g.totalDays / 7))} ${this.t('labels.weeksUnit')} ${f.format(g.totalDays % 7)} ${this.t('labels.daysUnit')}`;
  });
  readonly gapBreakdownText = computed(() => {
    const g = this.gap();
    if (!g) return '';
    const f = new Intl.NumberFormat(this.locale());
    return `${f.format(g.years)} ${this.t('labels.years')}, ${f.format(g.months)} ${this.t('labels.months')}, ${f.format(g.days)} ${this.t('labels.dayUnit')}`;
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

  setMode(m: 'addsub' | 'diff') { this.mode.set(m); }
  setDate(v: string) { this.date.set(v); }
  setDays(v: number) { this.days.set(this.clampNum(v, -100000, 100000)); }
  setDateA(v: string) { this.dateA.set(v); }
  setDateB(v: string) { this.dateB.set(v); }
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
