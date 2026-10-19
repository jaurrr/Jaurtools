import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-ideal-weight-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './ideal-weight-calculator.component.html',
  styleUrl: './ideal-weight-calculator.component.scss',
})
export class IdealWeightCalculatorComponent implements OnDestroy {
  readonly slug = 'ideal-weight-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'bmr-calculator', 'body-type-calculator', 'army-body-fat-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly gender = signal<'male' | 'female'>('male');
  readonly cm = signal(175);
  readonly feet = signal(5);
  readonly inches = signal(9);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly heightIn = computed(() =>
    this.unit() === 'metric' ? this.cm() / 2.54 : this.feet() * 12 + this.inches()
  );

  private readonly over5ft = computed(() => Math.max(0, this.heightIn() - 60));

  readonly devineKg = computed(() =>
    (this.gender() === 'male' ? 50 : 45.5) + 2.3 * this.over5ft()
  );
  readonly robinsonKg = computed(() =>
    (this.gender() === 'male' ? 52 : 49) + (this.gender() === 'male' ? 1.9 : 1.7) * this.over5ft()
  );
  readonly millerKg = computed(() =>
    (this.gender() === 'male' ? 56.2 : 53.1) + (this.gender() === 'male' ? 1.41 : 1.36) * this.over5ft()
  );
  readonly hamwiKg = computed(() =>
    (this.gender() === 'male' ? 48 : 45.5) + (this.gender() === 'male' ? 2.7 : 2.2) * this.over5ft()
  );

  readonly inUserUnit = computed(() => {
    const kg = { devine: this.devineKg(), robinson: this.robinsonKg(), miller: this.millerKg(), hamwi: this.hamwiKg() };
    if (this.unit() === 'metric') {
      return { ...kg, unit: this.t('labels.kgUnit') };
    }
    const toLb = (v: number) => v / 0.45359237;
    return { devine: toLb(kg.devine), robinson: toLb(kg.robinson), miller: toLb(kg.miller), hamwi: toLb(kg.hamwi), unit: this.t('labels.lbUnit') };
  });

  readonly rangeBand = computed(() => {
    const vals = [this.devineKg(), this.robinsonKg(), this.millerKg(), this.hamwiKg()];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (this.unit() === 'metric') return { lo, hi, unit: this.t('labels.kgUnit') };
    return { lo: lo / 0.45359237, hi: hi / 0.45359237, unit: this.t('labels.lbUnit') };
  });

  readonly copied = signal(false);
  copyRange(): void {
    const r = this.rangeBand();
    const text = `${this.t('name')}: ${this.oneDecimal().format(r.lo)} – ${this.oneDecimal().format(r.hi)} ${r.unit}`;
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
  setFeet(v: number) { this.feet.set(this.clampNum(v, 4, 7)); }
  setInches(v: number) { this.inches.set(this.clampNum(v, 0, 11)); }

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
