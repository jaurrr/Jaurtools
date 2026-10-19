import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-motor-starting-current-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './motor-starting-current-calculator.component.html',
  styleUrl: './motor-starting-current-calculator.component.scss',
})
export class MotorStartingCurrentCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.amps1().format(this.startingCurrent()) + this.t('labels.ampsUnit'));
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

  readonly slug = 'motor-starting-current-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['unit-converter', 'percentage-calculator', 'time-value-of-money-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly power = signal(10);
  readonly powerUnit = signal<'hp' | 'kw'>('hp');
  readonly voltage = signal(415);
  readonly phases = signal<1 | 3>(3);
  readonly efficiency = signal(88);
  readonly powerFactor = signal(0.85);
  readonly multiplier = signal(6);

  readonly amps = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  readonly amps1 = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  readonly watts = computed(
    () => this.power() * (this.powerUnit() === 'hp' ? 746 : 1000)
  );
  readonly fullLoadCurrent = computed(() => {
    const w = this.watts();
    const v = this.voltage();
    const e = this.efficiency() / 100;
    const p = this.powerFactor();
    if (w <= 0 || v <= 0 || e <= 0 || p <= 0) return 0;
    const denom = this.phases() === 3 ? Math.sqrt(3) * v * e * p : v * e * p;
    return w / denom;
  });
  readonly startingCurrent = computed(() => this.fullLoadCurrent() * this.multiplier());
  readonly startingKva = computed(() => {
    const i = this.startingCurrent();
    const v = this.voltage();
    return (this.phases() === 3 ? Math.sqrt(3) * v * i : v * i) / 1000;
  });

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
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

  setPower(v: number) { this.power.set(this.clampNum(v, 0, 10000)); }
  setPowerUnit(u: 'hp' | 'kw') { this.powerUnit.set(u); }
  setVoltage(v: number) { this.voltage.set(this.clampNum(v, 1, 33000)); }
  setPhases(v: number) { this.phases.set(v === 1 ? 1 : 3); }
  setEfficiency(v: number) { this.efficiency.set(this.clampNum(v, 1, 100)); }
  setPowerFactor(v: number) { this.powerFactor.set(this.clampNum(v, 0.01, 1)); }
  setMultiplier(v: number) { this.multiplier.set(this.clampNum(v, 1, 12)); }

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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
