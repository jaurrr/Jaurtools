import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-period-pregnancy-tracker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './period-pregnancy-tracker.component.html',
  styleUrl: './period-pregnancy-tracker.component.scss',
})
export class PeriodPregnancyTrackerComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.format(this.nextPeriod()));
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

  readonly slug = 'period-pregnancy-tracker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['conception-calculator', 'bmi-calculator', 'ideal-weight-calculator', 'bmr-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'period' | 'pregnancy'>('period');
  readonly lmp = signal('2026-09-15');
  readonly cycleLength = signal(28);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly lmpDate = computed(() => {
    const d = new Date(this.lmp() + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  });

  private addDays(d: Date, days: number): Date {
    const c = new Date(d);
    c.setDate(c.getDate() + days);
    return c;
  }

  // Period mode
  readonly nextPeriod = computed(() => {
    const d = this.lmpDate();
    if (!d) return null;
    return this.addDays(d, this.cycleLength());
  });

  readonly previousPeriod = computed(() => {
    const d = this.lmpDate();
    if (!d) return null;
    return this.addDays(d, -this.cycleLength());
  });

  readonly ovulation = computed(() => {
    const d = this.lmpDate();
    if (!d) return null;
    return this.addDays(d, this.cycleLength() - 14);
  });

  readonly fertileStart = computed(() => {
    const o = this.ovulation();
    if (!o) return null;
    return this.addDays(o, -4);
  });

  readonly fertileEnd = computed(() => {
    const o = this.ovulation();
    if (!o) return null;
    return this.addDays(o, 4);
  });

  // Pregnancy mode
  readonly dueDate = computed(() => {
    const d = this.lmpDate();
    if (!d) return null;
    return this.addDays(d, 280);
  });

  readonly weeksPregnant = computed(() => {
    const d = this.lmpDate();
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (days < 0) return null;
    return { weeks: Math.floor(days / 7), days: days % 7 };
  });

  readonly trimester = computed(() => {
    const w = this.weeksPregnant();
    if (!w) return null;
    if (w.weeks < 14) return 1;
    if (w.weeks < 28) return 2;
    return 3;
  });

  readonly dateFmt = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' })
  );

  format(d: Date | null): string {
    return d ? this.dateFmt().format(d) : '';
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

  setMode(m: 'period' | 'pregnancy') { this.mode.set(m); }
  setLmp(v: string) { this.lmp.set(v); }
  setCycleLength(v: number) { this.cycleLength.set(this.clampNum(v, 21, 45)); }

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
