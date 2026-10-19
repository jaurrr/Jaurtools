import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-walking-time-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './walking-time-calculator.component.html',
  styleUrl: './walking-time-calculator.component.scss',
})
export class WalkingTimeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.mileTime().m + this.t('labels.minUnit') + this.mileTime().s + this.t('labels.secUnit'));
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

  readonly slug = 'walking-time-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'weight-calculator', 'waist-to-hip-ratio-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly speed = signal(5);
  readonly age = signal(30);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly speedKmh = computed(() =>
    this.unit() === 'metric' ? this.speed() : this.speed() * 1.609344
  );
  readonly speedMph = computed(() => this.speedKmh() / 1.609344);

  readonly mileMinutes = computed(() => {
    const mph = this.speedMph();
    return mph > 0 ? 60 / mph : 0;
  });

  readonly mileTime = computed(() => this.toMinSec(this.mileMinutes()));
  readonly pacePerKm = computed(() =>
    this.speedKmh() > 0 ? this.toMinSec(60 / this.speedKmh()) : { m: 0, s: 0 }
  );
  readonly pacePerMile = computed(() => this.toMinSec(this.mileMinutes()));

  readonly paceCategory = computed(() => {
    const v = this.speedKmh();
    if (v < 3.2) return 'slow';
    if (v < 4.8) return 'easy';
    if (v < 6.4) return 'moderate';
    if (v < 8) return 'brisk';
    return 'fast';
  });

  readonly typicalRange = computed((): [number, number] => {
    const a = this.age();
    if (a < 20) return [4.5, 5.0];
    if (a < 30) return [4.8, 5.0];
    if (a < 40) return [4.8, 5.1];
    if (a < 50) return [5.0, 5.1];
    if (a < 60) return [4.7, 5.1];
    if (a < 70) return [4.5, 4.8];
    if (a < 80) return [4.1, 4.5];
    return [3.4, 3.9];
  });

  readonly ageComparison = computed(() => {
    const v = this.speedKmh();
    const [lo, hi] = this.typicalRange();
    if (v < lo) return 'below';
    if (v > hi) return 'above';
    return 'within';
  });

  readonly typicalDisplay = computed((): [number, number] => {
    const [lo, hi] = this.typicalRange();
    return this.unit() === 'metric' ? [lo, hi] : [lo / 1.609344, hi / 1.609344];
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

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

  setUnit(u: 'metric' | 'imperial') { this.unit.set(u); }
  setSpeed(v: number) {
    this.speed.set(this.unit() === 'metric' ? this.clampNum(v, 1, 15) : this.clampNum(v, 0.6, 10));
  }
  setAge(v: number) { this.age.set(Math.round(this.clampNum(v, 10, 110))); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private toMinSec(min: number): { m: number; s: number } {
    const total = Math.max(0, min);
    const m = Math.floor(total);
    let s = Math.round((total - m) * 60);
    if (s === 60) return { m: m + 1, s: 0 };
    return { m, s };
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
