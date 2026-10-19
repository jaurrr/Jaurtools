import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-weight-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './weight-calculator.component.html',
  styleUrl: './weight-calculator.component.scss',
})
export class WeightCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.twoDecimal().format(this.weightN()) + "N");
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

  readonly slug = 'weight-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'waist-to-hip-ratio-calculator', 'weight-watchers-points-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly massUnit = signal<'kg' | 'lb'>('kg');
  readonly mass = signal(70);
  readonly bodyIndex = signal(0);
  readonly customGravity = signal(9.81);

  readonly bodyGravity = [9.807, 1.62, 3.71, 3.7, 8.87, 24.79, 10.44, 8.69, 11.15, 0.62, 274.0];
  readonly customIndex = 11;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly gravity = computed(() => {
    const i = this.bodyIndex();
    return i === this.customIndex ? this.customGravity() : this.bodyGravity[i];
  });

  readonly massKg = computed(() =>
    this.massUnit() === 'kg' ? this.mass() : this.mass() * 0.45359237
  );

  readonly weightN = computed(() => {
    const g = this.gravity();
    return g > 0 ? this.massKg() * g : 0;
  });
  readonly weightKgf = computed(() => this.weightN() / 9.80665);
  readonly weightLbf = computed(() => this.weightN() * 0.224809);

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

  setMassUnit(u: 'kg' | 'lb') { this.massUnit.set(u); }
  setMass(v: number) { this.mass.set(this.clampNum(v, 0.1, 2000)); }
  setBodyIndex(v: number | string) {
    const i = typeof v === 'string' ? parseInt(v, 10) : v;
    if (Number.isFinite(i)) this.bodyIndex.set(Math.min(this.customIndex, Math.max(0, i)));
  }
  setCustomGravity(v: number) { this.customGravity.set(this.clampNum(v, 0.01, 1000)); }

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
