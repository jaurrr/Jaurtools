import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-army-body-fat-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './army-body-fat-calculator.component.html',
  styleUrl: './army-body-fat-calculator.component.scss',
})
export class ArmyBodyFatCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.fatPct()) + "%");
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

  readonly slug = 'army-body-fat-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'ideal-weight-calculator', 'body-type-calculator', 'bmr-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly gender = signal<'male' | 'female'>('male');
  readonly ageGroup = signal<'17-20' | '21-27' | '28-39' | '40+'>('28-39');
  readonly cm = signal(178);
  readonly abdomenCm = signal(86);
  readonly neckCm = signal(39);
  readonly waistCm = signal(74);
  readonly hipCm = signal(96);
  readonly feet = signal(5);
  readonly inches = signal(10);
  readonly abdomenIn = signal(34);
  readonly neckIn = signal(15.5);
  readonly waistIn = signal(29);
  readonly hipIn = signal(38);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly measureIn = computed(() => {
    const toIn = (cm: number) => cm / 2.54;
    if (this.unit() === 'metric') {
      return {
        height: toIn(this.cm()),
        abdomen: toIn(this.abdomenCm()),
        neck: toIn(this.neckCm()),
        waist: toIn(this.waistCm()),
        hip: toIn(this.hipCm()),
      };
    }
    return {
      height: this.feet() * 12 + this.inches(),
      abdomen: this.abdomenIn(),
      neck: this.neckIn(),
      waist: this.waistIn(),
      hip: this.hipIn(),
    };
  });

  readonly fatPct = computed(() => {
    const m = this.measureIn();
    if (m.height <= 0) return 0;
    if (this.gender() === 'male') {
      const diff = m.abdomen - m.neck;
      if (diff <= 0) return 0;
      return 86.01 * Math.log10(diff) - 70.041 * Math.log10(m.height) + 36.76;
    }
    const diff = m.waist + m.hip - m.neck;
    if (diff <= 0) return 0;
    return 163.205 * Math.log10(diff) - 97.684 * Math.log10(m.height) - 78.387;
  });

  readonly maxAllowed = computed(() => {
    const table: Record<string, { male: number; female: number }> = {
      '17-20': { male: 20, female: 30 },
      '21-27': { male: 22, female: 32 },
      '28-39': { male: 24, female: 34 },
      '40+': { male: 26, female: 36 },
    };
    return table[this.ageGroup()][this.gender()];
  });

  readonly status = computed(() => (this.fatPct() <= this.maxAllowed() ? 'pass' : 'fail'));

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
  setAgeGroup(a: '17-20' | '21-27' | '28-39' | '40+') { this.ageGroup.set(a); }
  setCm(v: number) { this.cm.set(this.clampNum(v, 120, 220)); }
  setAbdomenCm(v: number) { this.abdomenCm.set(this.clampNum(v, 50, 160)); }
  setNeckCm(v: number) { this.neckCm.set(this.clampNum(v, 25, 70)); }
  setWaistCm(v: number) { this.waistCm.set(this.clampNum(v, 50, 160)); }
  setHipCm(v: number) { this.hipCm.set(this.clampNum(v, 60, 180)); }
  setFeet(v: number) { this.feet.set(this.clampNum(v, 4, 7)); }
  setInches(v: number) { this.inches.set(this.clampNum(v, 0, 11)); }
  setAbdomenIn(v: number) { this.abdomenIn.set(this.clampNum(v, 20, 65)); }
  setNeckIn(v: number) { this.neckIn.set(this.clampNum(v, 10, 28)); }
  setWaistIn(v: number) { this.waistIn.set(this.clampNum(v, 20, 65)); }
  setHipIn(v: number) { this.hipIn.set(this.clampNum(v, 24, 72)); }

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
