import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-slope-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './slope-calculator.component.html',
  styleUrl: './slope-calculator.component.scss',
})
export class SlopeCalculatorComponent implements OnDestroy {
  readonly slug = 'slope-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['triangle-calculator', 'scientific-calculator', 'percentage-calculator', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly x1 = signal(1);
  readonly y1 = signal(2);
  readonly x2 = signal(4);
  readonly y2 = signal(8);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly dx = computed(() => this.x2() - this.x1());
  readonly dy = computed(() => this.y2() - this.y1());

  readonly isVertical = computed(() => this.dx() === 0);
  readonly isPoint = computed(() => this.dx() === 0 && this.dy() === 0);

  readonly slope = computed(() => {
    if (this.isVertical()) return NaN;
    return this.dy() / this.dx();
  });

  readonly yIntercept = computed(() => {
    if (this.isVertical()) return NaN;
    return this.y1() - this.slope() * this.x1();
  });

  readonly equation = computed(() => {
    if (this.isPoint()) return this.t('labels.samePoint');
    if (this.isVertical()) return `x = ${this.fmt(this.x1())}`;
    const m = this.slope();
    const b = this.yIntercept();
    const mStr = Math.abs(m) === 1 ? (m < 0 ? '−x' : 'x') : `${this.fmt(m)}x`;
    if (b === 0) return `y = ${mStr}`;
    if (m === 0) return `y = ${this.fmt(b)}`;
    return b < 0 ? `y = ${mStr} − ${this.fmt(Math.abs(b))}` : `y = ${mStr} + ${this.fmt(b)}`;
  });

  readonly distance = computed(() =>
    Math.sqrt(this.dx() ** 2 + this.dy() ** 2)
  );

  readonly midpoint = computed(() => ({
    x: (this.x1() + this.x2()) / 2,
    y: (this.y1() + this.y2()) / 2,
  }));

  readonly angleDeg = computed(() => {
    if (this.isPoint()) return NaN;
    return (Math.atan2(this.dy(), this.dx()) * 180) / Math.PI;
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

  setX1(v: number) { this.x1.set(this.clampNum(v, -1e6, 1e6)); }
  setY1(v: number) { this.y1.set(this.clampNum(v, -1e6, 1e6)); }
  setX2(v: number) { this.x2.set(this.clampNum(v, -1e6, 1e6)); }
  setY2(v: number) { this.y2.set(this.clampNum(v, -1e6, 1e6)); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  fmt(v: number): string {
    if (!Number.isFinite(v)) return '–';
    return String(parseFloat(v.toPrecision(8)));
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
