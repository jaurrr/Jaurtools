import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-steps-to-miles-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './steps-to-miles-calculator.component.html',
  styleUrl: './steps-to-miles-calculator.component.scss',
})
export class StepsToMilesCalculatorComponent implements OnDestroy {
  readonly slug = 'steps-to-miles-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pace-calculator', 'target-heart-rate-calculator', 'bmi-calculator', 'kilojoules-calories-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'steps' | 'distance'>('steps');
  readonly steps = signal(10000);
  readonly height = signal(170);
  readonly sex = signal<'male' | 'female'>('male');
  readonly weight = signal(70);
  readonly distKm = signal(5);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly stride = computed(() => this.height() * (this.sex() === 'male' ? 0.415 : 0.413));

  readonly distanceKm = computed(() => (this.steps() * this.stride()) / 100000);

  readonly calories = computed(() => this.weight() * this.distanceKm() * 0.53);

  readonly stepsForDistance = computed(() =>
    this.stride() > 0 ? (this.distKm() * 100000) / this.stride() : 0
  );

  readonly zeroDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
  );
  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );
  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  setMode(v: 'steps' | 'distance') { this.mode.set(v); }
  setSex(v: 'male' | 'female') { this.sex.set(v); }
  setSteps(v: number) { this.steps.set(this.clampNum(v, 0, 100000)); }
  setHeight(v: number) { this.height.set(this.clampNum(v, 100, 230)); }
  setWeight(v: number) { this.weight.set(this.clampNum(v, 25, 300)); }
  setDistKm(v: number) { this.distKm.set(this.clampNum(v, 0.1, 500)); }

  readonly stepGoals = [5000, 7500, 10000, 12500, 15000];
  readonly goal = signal(10000);
  setGoal(g: number) {
    this.goal.set(g);
    this.steps.set(g);
  }
  readonly goalProgress = computed(() =>
    Math.min(100, Math.max(0, (this.steps() / Math.max(1, this.goal())) * 100))
  );

  readonly copied = signal(false);
  copyResult(): void {
    const text = this.mode() === 'steps'
      ? `${this.zeroDecimal().format(this.steps())} ${this.t('labels.stepsUnit')} = ${this.twoDecimal().format(this.distanceKm())} ${this.t('labels.kmUnit')}`
      : `${this.twoDecimal().format(this.distKm())} ${this.t('labels.kmUnit')} = ${this.zeroDecimal().format(this.stepsForDistance())} ${this.t('labels.stepsUnit')}`;
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
