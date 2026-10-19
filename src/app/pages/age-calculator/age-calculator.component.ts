import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const SLUG = 'age-calculator';
const SITE_URL = 'https://jaurtools.com';
const MIN_YEAR = 1900;

interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalWeeks: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  nextInDays: number;
  nextWeekday: string;
  turningAge: number;
  isBirthdayToday: boolean;
  isFeb29: boolean;
  dobLabel: string;
  refLabel: string;
  bornWeekday: string;
  zodiac: string;
  birthstone: string;
  generation: string;
  heartbeats: number;
  breaths: number;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

@Component({
  selector: 'app-age-calculator',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './age-calculator.component.html',
  styleUrl: './age-calculator.component.scss',
})
export class AgeCalculatorComponent implements OnDestroy {
  protected tr = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  readonly todayStr = toISODate(startOfToday());
  // Date-of-birth dropdowns (0 = not selected yet)
  readonly dobDay = signal(0);
  readonly dobMonth = signal(0);
  readonly dobYear = signal(0);
  // Reference-date dropdowns (default = today)
  readonly refDay = signal(startOfToday().getDate());
  readonly refMonth = signal(startOfToday().getMonth() + 1);
  readonly refYear = signal(startOfToday().getFullYear());
  readonly screen = signal<'main' | 'breakdown' | 'next' | 'birth' | 'fun'>('main');
  readonly relatedSlugs = ['bmi-calculator', 'percentage-calculator'];

  readonly yearOptions: number[] = (() => {
    const cur = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = cur; y >= MIN_YEAR; y--) arr.push(y);
    return arr;
  })();

  readonly dobISO = computed(() => {
    const y = this.dobYear(), m = this.dobMonth(), d = this.dobDay();
    if (!y || !m || !d) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });
  readonly refISO = computed(
    () =>
      `${this.refYear()}-${String(this.refMonth()).padStart(2, '0')}-${String(this.refDay()).padStart(2, '0')}`,
  );
  readonly dobDaysInMonth = computed(() => {
    const y = this.dobYear() || 2000;
    const m = this.dobMonth() || 1;
    return new Date(y, m, 0).getDate();
  });
  readonly refDaysInMonth = computed(() => new Date(this.refYear(), this.refMonth(), 0).getDate());

  monthNames(): string[] {
    this.tr.lang();
    return this.tr.t(`${SLUG}.ui.monthNames`) as unknown as string[];
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  onDobDay(v: string): void {
    this.dobDay.set(Number(v));
  }
  onDobMonth(v: string): void {
    this.dobMonth.set(Number(v));
    if (this.dobDay() > this.dobDaysInMonth()) this.dobDay.set(this.dobDaysInMonth());
  }
  onDobYear(v: string): void {
    this.dobYear.set(Number(v));
    if (this.dobDay() > this.dobDaysInMonth()) this.dobDay.set(this.dobDaysInMonth());
  }
  onRefDay(v: string): void {
    this.refDay.set(Number(v));
  }
  onRefMonth(v: string): void {
    this.refMonth.set(Number(v));
    if (this.refDay() > this.refDaysInMonth()) this.refDay.set(this.refDaysInMonth());
  }
  onRefYear(v: string): void {
    this.refYear.set(Number(v));
    if (this.refDay() > this.refDaysInMonth()) this.refDay.set(this.refDaysInMonth());
  }

  private nowTick = signal(Date.now());
  private timer = setInterval(() => this.nowTick.set(Date.now()), 1000);

  private locale = computed(() => {
    const lang = this.tr.lang();
    if (lang === 'hi') return 'hi-IN';
    if (lang === 'ar') return 'ar-SA-u-ca-gregory';
    return 'en-US';
  });
  private numFmt = computed(() => new Intl.NumberFormat(this.locale()));
  private dateFmt = computed(
    () => new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
  );

  readonly errors = computed<string[]>(() => {
    const problems: string[] = [];
    const raw = this.dobISO();
    if (!raw) return problems;
    const dob = this.parseDate(raw);
    if (!dob) {
      problems.push(this.t('ui.errors.invalid'));
      return problems;
    }
    const today = startOfToday();
    const ref = this.parseDate(this.refISO()) ?? today;
    if (dob.getFullYear() < MIN_YEAR) problems.push(this.t('ui.errors.before1900'));
    if (dob.getTime() > ref.getTime()) problems.push(this.t('ui.errors.future'));
    if (ref.getTime() > today.getTime()) problems.push(this.t('ui.errors.refFuture'));
    return problems;
  });

  readonly result = computed<AgeResult | null>(() => {
    if (this.errors().length > 0) return null;
    const dob = this.parseDate(this.dobISO());
    if (!dob) return null;
    const ref = this.parseDate(this.refISO()) ?? startOfToday();
    return this.buildResult(dob, ref);
  });

  private seo = effect(() => {
    const lang = this.tr.lang();
    this.title.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.upsertLink('seo-canonical', { rel: 'canonical', href: `${SITE_URL}/${lang}/${SLUG}` });
    for (const code of ['en', 'hi', 'ar']) {
      this.upsertLink(`seo-alt-${code}`, {
        rel: 'alternate',
        hreflang: code,
        href: `${SITE_URL}/${code}/${SLUG}`,
      });
    }
    this.upsertLink('seo-alt-x-default', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: `${SITE_URL}/en/${SLUG}`,
    });
    this.upsertFaqJsonLd();
  });

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.doc.getElementById(`faq-jsonld-${SLUG}`)?.remove();
    this.doc.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  t(path: string): string {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as string;
  }

  list(path: string): string[] {
    this.tr.lang();
    return this.tr.t(`${SLUG}.${path}`) as unknown as string[];
  }

  faqs(): Array<{ q: string; a: string }> {
    this.tr.lang();
    return this.tr.t(`${SLUG}.faqs`) as unknown as Array<{ q: string; a: string }>;
  }

  relatedName(slug: string): string {
    this.tr.lang();
    const name = this.tr.t(`${slug}.name`);
    return typeof name === 'string' && name ? name : slug;
  }

  fmt(n: number): string {
    return this.numFmt().format(Math.round(n));
  }

  private parseDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
      d.getFullYear() !== Number(match[1]) ||
      d.getMonth() !== Number(match[2]) - 1 ||
      d.getDate() !== Number(match[3])
    ) {
      return null;
    }
    return d;
  }

  private ageYMD(dob: Date, ref: Date): { years: number; months: number; days: number } {
    let years = ref.getFullYear() - dob.getFullYear();
    let months = ref.getMonth() - dob.getMonth();
    let days = ref.getDate() - dob.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years, months, days };
  }

  private nextBirthday(dob: Date, ref: Date): { date: Date; inDays: number } {
    const month = dob.getMonth();
    const day = dob.getDate();
    const atYear = (year: number): Date => {
      const dim = new Date(year, month + 1, 0).getDate();
      return new Date(year, month, Math.min(day, dim));
    };
    let candidate = atYear(ref.getFullYear());
    if (candidate.getTime() < ref.getTime()) candidate = atYear(ref.getFullYear() + 1);
    const inDays = Math.round((candidate.getTime() - ref.getTime()) / 86400000);
    return { date: candidate, inDays };
  }

  private zodiacKey(month: number, day: number): string {
    const bounds: Array<[number, number, string]> = [
      [1, 20, 'aquarius'],
      [2, 19, 'pisces'],
      [3, 21, 'aries'],
      [4, 20, 'taurus'],
      [5, 21, 'gemini'],
      [6, 21, 'cancer'],
      [7, 23, 'leo'],
      [8, 23, 'virgo'],
      [9, 23, 'libra'],
      [10, 23, 'scorpio'],
      [11, 22, 'sagittarius'],
      [12, 22, 'capricorn'],
    ];
    let sign = 'capricorn';
    for (const [m, d, key] of bounds) {
      if (month > m || (month === m && day >= d)) sign = key;
    }
    return sign;
  }

  private generationKey(year: number): string {
    if (year < 1946) return 'silent';
    if (year < 1965) return 'boomer';
    if (year < 1981) return 'genx';
    if (year < 1997) return 'millennial';
    if (year < 2013) return 'genz';
    return 'alpha';
  }

  private buildResult(dob: Date, ref: Date): AgeResult {
    this.tr.lang();
    const { years, months, days } = this.ageYMD(dob, ref);
    const totalDays = Math.round((ref.getTime() - dob.getTime()) / 86400000);
    const totalHours = totalDays * 24;
    const totalMinutes = totalHours * 60;
    const refIsToday = ref.getTime() === startOfToday().getTime();
    const endMs = refIsToday ? this.nowTick() : ref.getTime();
    const totalSeconds = Math.max(0, Math.floor((endMs - dob.getTime()) / 1000));

    const next = this.nextBirthday(dob, ref);
    const weekdays = this.list('ui.weekdays');
    const zodiacNames = this.tr.t(`${SLUG}.ui.zodiac`) as unknown as Record<string, string>;
    const stones = this.list('ui.birthstones');
    const generations = this.tr.t(`${SLUG}.ui.generations`) as unknown as Record<string, string>;

    return {
      years,
      months,
      days,
      totalMonths: years * 12 + months,
      totalWeeks: Math.floor(totalDays / 7),
      totalDays,
      totalHours,
      totalMinutes,
      totalSeconds,
      nextInDays: next.inDays,
      nextWeekday: weekdays[next.date.getDay()],
      turningAge: next.date.getFullYear() - dob.getFullYear(),
      isBirthdayToday: next.inDays === 0,
      isFeb29: dob.getMonth() === 1 && dob.getDate() === 29,
      dobLabel: this.dateFmt().format(dob),
      refLabel: this.dateFmt().format(ref),
      bornWeekday: weekdays[dob.getDay()],
      zodiac: zodiacNames[this.zodiacKey(dob.getMonth() + 1, dob.getDate())],
      birthstone: stones[dob.getMonth()],
      generation: generations[this.generationKey(dob.getFullYear())],
      heartbeats: totalMinutes * 70,
      breaths: totalMinutes * 16,
    };
  }

  private upsertLink(id: string, attrs: Record<string, string>): void {
    let el = this.doc.head.querySelector<HTMLLinkElement>(`#${id}`);
    if (!el) {
      el = this.doc.createElement('link');
      el.id = id;
      this.doc.head.appendChild(el);
    }
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  }

  private upsertFaqJsonLd(): void {
    const id = `faq-jsonld-${SLUG}`;
    this.doc.getElementById(id)?.remove();
    const faqs = this.tr.t(`${SLUG}.faqs`) as unknown as Array<{ q: string; a: string }>;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    const script = this.doc.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    this.doc.head.appendChild(script);
  }
}
