import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-age-difference-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './age-difference-calculator.component.html',
  styleUrl: './age-difference-calculator.component.scss',
})
export class AgeDifferenceCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.gapText());
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

  readonly slug = 'age-difference-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['birthday-calculator', 'days-between-dates', 'date-calculator', 'online-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly dateA = signal('1995-06-15');
  readonly dateB = signal('2000-03-10');

  readonly diff = computed(() => {
    const a = this.parseLocalDate(this.dateA());
    const b = this.parseLocalDate(this.dateB());
    if (!a || !b) return null;
    let early = a, late = b, firstOlder = true;
    if (a.getTime() > b.getTime()) { early = b; late = a; firstOlder = false; }
    let years = late.getFullYear() - early.getFullYear();
    let months = late.getMonth() - early.getMonth();
    let days = late.getDate() - early.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(late.getFullYear(), late.getMonth(), 0).getDate();
    }
    if (months < 0) { years -= 1; months += 12; }
    const totalDays = Math.round((late.getTime() - early.getTime()) / 86400000);
    return { years, months, days, totalDays, firstOlder };
  });
  readonly gapText = computed(() => {
    const d = this.diff();
    if (!d) return '';
    const f = new Intl.NumberFormat(this.locale());
    return `${f.format(d.years)} ${this.t('labels.years')}, ${f.format(d.months)} ${this.t('labels.months')}, ${f.format(d.days)} ${this.t('labels.days')}`;
  });
  readonly totalWeeks = computed(() => {
    const d = this.diff();
    if (!d) return '';
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 }).format(d.totalDays / 7);
  });
  readonly totalMonths = computed(() => {
    const d = this.diff();
    if (!d) return '';
    return new Intl.NumberFormat(this.locale()).format(d.years * 12 + d.months);
  });
  readonly totalDaysText = computed(() => {
    const d = this.diff();
    if (!d) return '';
    return new Intl.NumberFormat(this.locale()).format(d.totalDays);
  });
  readonly olderText = computed(() => {
    const d = this.diff();
    if (!d) return '';
    return d.firstOlder ? this.t('labels.firstPerson') : this.t('labels.secondPerson');
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
