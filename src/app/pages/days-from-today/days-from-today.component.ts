import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-days-from-today',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './days-from-today.component.html',
  styleUrl: './days-from-today.component.scss',
})
export class DaysFromTodayComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fromTodayLabel());
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

  readonly slug = 'days-from-today';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['btu-calculator', 'bandwidth-calculator', 'cbm-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'fromToday' | 'untilDate'>('fromToday');
  readonly days = signal(30);
  readonly direction = signal<'future' | 'past'>('future');
  readonly targetDate = signal(this.toIso(this.addDays(new Date(), 30)));

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private addDays(base: Date, n: number): Date {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  private toIso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  readonly fromTodayResult = computed(() => {
    const n = Math.round(this.days());
    return this.addDays(new Date(), this.direction() === 'future' ? n : -n);
  });

  readonly fromTodayLabel = computed(() => this.formatFull(this.fromTodayResult()));
  readonly fromTodayWeekday = computed(() => this.formatWeekday(this.fromTodayResult()));

  readonly untilDiff = computed(() => {
    const parts = this.targetDate().split('-').map(Number);
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((target.getTime() - start.getTime()) / 86400000);
  });

  readonly untilWeekday = computed(() => {
    const parts = this.targetDate().split('-').map(Number);
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return '';
    return this.formatWeekday(new Date(parts[0], parts[1] - 1, parts[2]));
  });

  private formatFull(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'full' }).format(d);
  }

  private formatWeekday(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long' }).format(d);
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

  setMode(m: 'fromToday' | 'untilDate') { this.mode.set(m); }
  setDays(v: number) { this.days.set(Math.round(this.clampNum(v, 0, 36500))); }
  setDirection(d: 'future' | 'past') { this.direction.set(d); }
  setTargetDate(v: string) { this.targetDate.set(v); }

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
    return Math.min(max, Math.max(min, v));
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
