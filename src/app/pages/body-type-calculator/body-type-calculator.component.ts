import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-body-type-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './body-type-calculator.component.html',
  styleUrl: './body-type-calculator.component.scss',
})
export class BodyTypeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.t('somatotypes.' + this.somatotype()));
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

  readonly slug = 'body-type-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'army-body-fat-calculator', 'ideal-weight-calculator', 'bmr-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly gender = signal<'male' | 'female'>('male');
  readonly cm = signal(178);
  readonly kg = signal(72);
  readonly wristCm = signal(17);
  readonly feet = signal(5);
  readonly inches = signal(10);
  readonly pounds = signal(159);
  readonly wristIn = signal(6.7);

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
      return { heightCm: this.cm(), weightKg: this.kg(), wristCm: this.wristCm() };
    }
    return {
      heightCm: (this.feet() * 12 + this.inches()) * 2.54,
      weightKg: this.pounds() * 0.45359237,
      wristCm: this.wristIn() * 2.54,
    };
  });

  readonly frameRatio = computed(() => {
    const m = this.metric();
    if (m.wristCm <= 0) return 0;
    return m.heightCm / m.wristCm;
  });

  readonly frame = computed(() => {
    const r = this.frameRatio();
    if (this.gender() === 'male') {
      if (r > 10.4) return 'small';
      if (r >= 9.6) return 'medium';
      return 'large';
    }
    if (r > 11) return 'small';
    if (r >= 10.1) return 'medium';
    return 'large';
  });

  private readonly bmi = computed(() => {
    const m = this.metric();
    const h = m.heightCm / 100;
    if (h <= 0) return 0;
    return m.weightKg / (h * h);
  });

  readonly somatotype = computed(() => {
    const f = this.frame();
    const b = this.bmi();
    if (b < 19 || (f === 'small' && b < 22)) return 'ectomorph';
    if (b >= 28 || (f === 'large' && b >= 26)) return 'endomorph';
    return 'mesomorph';
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
  setGender(g: 'male' | 'female') { this.gender.set(g); }
  setCm(v: number) { this.cm.set(this.clampNum(v, 120, 220)); }
  setKg(v: number) { this.kg.set(this.clampNum(v, 20, 300)); }
  setWristCm(v: number) { this.wristCm.set(this.clampNum(v, 10, 28)); }
  setFeet(v: number) { this.feet.set(this.clampNum(v, 4, 7)); }
  setInches(v: number) { this.inches.set(this.clampNum(v, 0, 11)); }
  setPounds(v: number) { this.pounds.set(this.clampNum(v, 50, 700)); }
  setWristIn(v: number) { this.wristIn.set(this.clampNum(v, 4, 11)); }

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
