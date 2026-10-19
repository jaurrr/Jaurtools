import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'extra';

@Component({
  selector: 'app-bmr-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './bmr-calculator.component.html',
  styleUrl: './bmr-calculator.component.scss',
})
export class BmrCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.whole().format(this.bmr()) + this.t('labels.kcalUnit'));
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

  readonly slug = 'bmr-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tdee-calculator', 'calories-burned-calculator', 'bmi-calculator', 'carbohydrate-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly gender = signal<'male' | 'female'>('male');
  readonly age = signal(30);
  readonly cm = signal(175);
  readonly kg = signal(70);
  readonly feet = signal(5);
  readonly inches = signal(9);
  readonly pounds = signal(154);
  readonly activity = signal<Activity>('moderate');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly metric = computed(() => {
    if (this.unit() === 'metric') {
      return { heightCm: this.cm(), weightKg: this.kg() };
    }
    return {
      heightCm: (this.feet() * 12 + this.inches()) * 2.54,
      weightKg: this.pounds() * 0.45359237,
    };
  });

  readonly bmr = computed(() => {
    const m = this.metric();
    const base = 10 * m.weightKg + 6.25 * m.heightCm - 5 * this.age();
    return this.gender() === 'male' ? base + 5 : base - 161;
  });

  private readonly activityFactor = computed(() => {
    const f: Record<Activity, number> = {
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, extra: 1.9,
    };
    return f[this.activity()];
  });

  readonly activityCalories = computed(() => this.bmr() * (this.activityFactor() - 1));
  readonly tdee = computed(() => this.bmr() * this.activityFactor());

  readonly whole = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
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
  setGender(g: 'male' | 'female') { this.gender.set(g); }
  setAge(v: number) { this.age.set(this.clampNum(v, 10, 100)); }
  setCm(v: number) { this.cm.set(this.clampNum(v, 100, 220)); }
  setKg(v: number) { this.kg.set(this.clampNum(v, 20, 300)); }
  setFeet(v: number) { this.feet.set(this.clampNum(v, 3, 7)); }
  setInches(v: number) { this.inches.set(this.clampNum(v, 0, 11)); }
  setPounds(v: number) { this.pounds.set(this.clampNum(v, 50, 700)); }
  setActivity(a: Activity) { this.activity.set(a); }

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
