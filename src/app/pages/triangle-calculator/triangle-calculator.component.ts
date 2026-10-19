import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-triangle-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './triangle-calculator.component.html',
  styleUrl: './triangle-calculator.component.scss',
})
export class TriangleCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt(this.area()));
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

  readonly slug = 'triangle-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['slope-calculator', 'surface-area-calculator', 'volume-calculator', 'scientific-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sideA = signal(3);
  readonly sideB = signal(4);
  readonly sideC = signal(5);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly valid = computed(() => {
    const a = this.sideA();
    const b = this.sideB();
    const c = this.sideC();
    return (
      a > 0 && b > 0 && c > 0 &&
      a + b > c && a + c > b && b + c > a
    );
  });

  readonly perimeter = computed(() => this.sideA() + this.sideB() + this.sideC());

  readonly semi = computed(() => this.perimeter() / 2);

  readonly area = computed(() => {
    if (!this.valid()) return NaN;
    const a = this.sideA();
    const b = this.sideB();
    const c = this.sideC();
    const s = this.semi();
    return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  });

  private angleFor(opposite: number, s1: number, s2: number): number {
    const cosA = (s1 * s1 + s2 * s2 - opposite * opposite) / (2 * s1 * s2);
    const clamped = Math.min(1, Math.max(-1, cosA));
    return (Math.acos(clamped) * 180) / Math.PI;
  }

  readonly angleA = computed(() =>
    this.valid() ? this.angleFor(this.sideA(), this.sideB(), this.sideC()) : NaN
  );
  readonly angleB = computed(() =>
    this.valid() ? this.angleFor(this.sideB(), this.sideA(), this.sideC()) : NaN
  );
  readonly angleC = computed(() =>
    this.valid() ? this.angleFor(this.sideC(), this.sideA(), this.sideB()) : NaN
  );

  readonly sideType = computed((): string => {
    if (!this.valid()) return '';
    const a = this.sideA();
    const b = this.sideB();
    const c = this.sideC();
    const eq = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    if (eq(a, b) && eq(b, c)) return this.t('labels.equilateral');
    if (eq(a, b) || eq(b, c) || eq(a, c)) return this.t('labels.isosceles');
    return this.t('labels.scalene');
  });

  readonly angleType = computed((): string => {
    if (!this.valid()) return '';
    const angles = [this.angleA(), this.angleB(), this.angleC()];
    if (angles.some((x) => Math.abs(x - 90) < 0.5)) return this.t('labels.right');
    if (angles.some((x) => x > 90)) return this.t('labels.obtuse');
    return this.t('labels.acute');
  });

  readonly circumradius = computed(() => {
    if (!this.valid() || this.area() === 0) return NaN;
    return (this.sideA() * this.sideB() * this.sideC()) / (4 * this.area());
  });

  readonly inradius = computed(() => {
    if (!this.valid()) return NaN;
    return this.area() / this.semi();
  });

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

  fmt(v: number): string {
    if (!Number.isFinite(v)) return '–';
    return String(parseFloat(v.toPrecision(8)));
  }

  setSideA(v: number) { this.sideA.set(this.clampNum(v, 0, 1e6)); }
  setSideB(v: number) { this.sideB.set(this.clampNum(v, 0, 1e6)); }
  setSideC(v: number) { this.sideC.set(this.clampNum(v, 0, 1e6)); }

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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
