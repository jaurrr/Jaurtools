import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-overweight-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './overweight-calculator.component.html',
  styleUrl: './overweight-calculator.component.scss',
})
export class OverweightCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.bmi()));
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

  readonly slug = 'overweight-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'lean-body-mass-calculator', 'macro-calculator', 'protein-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly cm = signal(170);
  readonly kg = signal(85);
  readonly feet = signal(5);
  readonly inches = signal(7);
  readonly pounds = signal(187);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly measure = computed(() => {
    if (this.unit() === 'metric') {
      return { heightM: this.cm() / 100, weightKg: this.kg() };
    }
    const totalInches = this.feet() * 12 + this.inches();
    return { heightM: totalInches * 0.0254, weightKg: this.pounds() * 0.45359237 };
  });

  readonly bmi = computed(() => {
    const m = this.measure();
    if (m.heightM <= 0 || m.weightKg <= 0) return 0;
    return m.weightKg / (m.heightM * m.heightM);
  });

  readonly category = computed(() => {
    const b = this.bmi();
    if (b < 18.5) return 'underweight';
    if (b < 25) return 'healthy';
    if (b < 30) return 'overweight';
    if (b < 35) return 'obese1';
    if (b < 40) return 'obese2';
    return 'obese3';
  });

  readonly badgeClass = computed(() => {
    const c = this.category();
    return c.startsWith('obese') ? 'obese' : c;
  });

  readonly healthyCeilingKg = computed(() => 24.9 * this.measure().heightM ** 2);

  readonly display = computed(() => {
    const metric = this.unit() === 'metric';
    const ceiling = metric ? this.healthyCeilingKg() : this.healthyCeilingKg() / 0.45359237;
    const weight = metric ? this.measure().weightKg : this.measure().weightKg / 0.45359237;
    return {
      ceiling,
      excess: Math.max(0, weight - ceiling),
      unit: metric ? this.t('labels.weightUnitMetric') : this.t('labels.weightUnitImperial'),
    };
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
  setCm(v: number) { this.cm.set(this.clampNum(v, 100, 230)); }
  setKg(v: number) { this.kg.set(this.clampNum(v, 20, 300)); }
  setFeet(v: number) { this.feet.set(this.clampNum(v, 3, 7)); }
  setInches(v: number) { this.inches.set(this.clampNum(v, 0, 11)); }
  setPounds(v: number) { this.pounds.set(this.clampNum(v, 50, 700)); }

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
