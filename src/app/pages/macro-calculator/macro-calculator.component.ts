import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-macro-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './macro-calculator.component.html',
  styleUrl: './macro-calculator.component.scss',
})
export class MacroCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.zeroDecimal().format(this.targetCalories()) + this.t('labels.kcalUnit'));
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

  readonly slug = 'macro-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['protein-calculator', 'lean-body-mass-calculator', 'bmi-calculator', 'kilojoules-calories-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sex = signal<'male' | 'female'>('male');
  readonly age = signal(30);
  readonly height = signal(175);
  readonly weight = signal(80);
  readonly activity = signal(1.55);
  readonly goal = signal<'lose' | 'maintain' | 'gain'>('maintain');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly bmr = computed(() => {
    const base = 10 * this.weight() + 6.25 * this.height() - 5 * this.age();
    return this.sex() === 'male' ? base + 5 : base - 161;
  });

  readonly tdee = computed(() => this.bmr() * this.activity());

  readonly targetCalories = computed(() => {
    const adj = this.goal() === 'lose' ? -400 : this.goal() === 'gain' ? 300 : 0;
    return this.tdee() + adj;
  });

  readonly macros = computed(() => {
    const w = this.weight();
    const protein = (this.goal() === 'lose' ? 2.0 : this.goal() === 'gain' ? 1.6 : 1.8) * w;
    const fat = 0.8 * w;
    const carbs = Math.max(0, (this.targetCalories() - protein * 4 - fat * 9) / 4);
    return {
      protein, fat, carbs,
      proteinKcal: protein * 4, fatKcal: fat * 9, carbsKcal: carbs * 4,
    };
  });

  readonly zeroDecimal = computed(() =>
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

  setSex(v: 'male' | 'female') { this.sex.set(v); }
  setGoal(v: 'lose' | 'maintain' | 'gain') { this.goal.set(v); }
  setActivity(v: number) { this.activity.set(Number.isFinite(v) ? v : 1.55); }
  setAge(v: number) { this.age.set(this.clampNum(v, 14, 90)); }
  setHeight(v: number) { this.height.set(this.clampNum(v, 120, 230)); }
  setWeight(v: number) { this.weight.set(this.clampNum(v, 30, 300)); }

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
