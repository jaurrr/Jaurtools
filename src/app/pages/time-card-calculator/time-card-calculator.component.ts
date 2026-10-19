import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-time-card-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './time-card-calculator.component.html',
  styleUrl: './time-card-calculator.component.scss',
})
export class TimeCardCalculatorComponent implements OnDestroy {
  readonly slug = 'time-card-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['overtime-calculator', 'online-stopwatch', 'pomodoro-timer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly threshold = signal(40);
  readonly starts = signal<string[]>(['09:00', '09:00', '09:00', '09:00', '09:00', '', '']);
  readonly ends = signal<string[]>(['17:00', '17:00', '17:00', '17:00', '17:00', '', '']);

  setThreshold(v: number) { this.threshold.set(this.clampNum(v, 0, 168)); }
  setStart(i: number, v: string) {
    this.starts.update((a) => a.map((x, n) => (n === i ? v : x)));
  }
  setEnd(i: number, v: string) {
    this.ends.update((a) => a.map((x, n) => (n === i ? v : x)));
  }
  readonly dayNames = computed(() => {
    const loc = this.locale();
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(new Date(2026, 9, 19 + i))
    );
  });
  private parseTime(s: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  private dayHours(s: string, e: string): number | null {
    if (!s.trim() || !e.trim()) return null;
    const a = this.parseTime(s), b = this.parseTime(e);
    if (a === null || b === null) return null;
    let mins = b - a;
    if (mins <= 0) mins += 24 * 60;
    return mins / 60;
  }
  readonly daily = computed(() => {
    const ss = this.starts(), ee = this.ends();
    return ss.map((s, i) => this.dayHours(s, ee[i]));
  });
  private fmtH(h: number): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 2 }).format(h);
  }
  dayText(i: number): string {
    const d = this.daily()[i];
    return d === null ? '' : this.fmtH(d);
  }
  readonly total = computed(() => {
    return this.daily().reduce<number>((x, d) => x + (d ?? 0), 0);
  });
  readonly overtime = computed(() => Math.max(0, this.total() - this.threshold()));
  readonly regular = computed(() => this.total() - this.overtime());
  readonly totalText = computed(() => this.fmtH(this.total()));
  readonly regularText = computed(() => this.fmtH(this.regular()));
  readonly overtimeText = computed(() => this.fmtH(this.overtime()));
  readonly copied = signal(false);

  copySummary(): void {
    const lines = this.daily().map(
      (d, i) => `${this.dayNames()[i]}: ${d === null ? '-' : this.fmtH(d) + 'h'}`,
    );
    const text = [
      `${this.t('name')} — ${this.t('labels.totalHours')}: ${this.totalText()}h`,
      `${this.t('labels.regularHours')}: ${this.regularText()}h`,
      `${this.t('labels.overtimeHours')}: ${this.overtimeText()}h`,
      ...lines,
    ].join('\n');
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
