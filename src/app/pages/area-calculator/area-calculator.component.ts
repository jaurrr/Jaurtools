import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Shape = 'rectangle' | 'square' | 'circle' | 'triangle' | 'trapezoid' | 'parallelogram' | 'ellipse';

@Component({
  selector: 'app-area-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './area-calculator.component.html',
  styleUrl: './area-calculator.component.scss',
})
export class AreaCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt().format(this.area()) + this.t('labels.sqUnits'));
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

  readonly slug = 'area-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['circle-calculator', 'distance-calculator', 'exponent-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly shapes: Shape[] = ['rectangle', 'square', 'circle', 'triangle', 'trapezoid', 'parallelogram', 'ellipse'];
  readonly shape = signal<Shape>('rectangle');
  readonly a = signal(12);
  readonly b = signal(8);
  readonly c = signal(5);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly needsB = computed(() =>
    ['rectangle', 'triangle', 'trapezoid', 'parallelogram', 'ellipse'].includes(this.shape())
  );
  readonly needsC = computed(() => this.shape() === 'trapezoid');

  readonly area = computed(() => {
    const s = this.shape();
    const a = this.a();
    const b = this.b();
    const c = this.c();
    switch (s) {
      case 'rectangle': return a * b;
      case 'square': return a * a;
      case 'circle': return Math.PI * a * a;
      case 'triangle': return 0.5 * a * b;
      case 'trapezoid': return 0.5 * (a + b) * c;
      case 'parallelogram': return a * b;
      case 'ellipse': return Math.PI * a * b;
    }
  });

  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 4 })
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

  setShape(s: Shape) {
    this.shape.set(s);
    const defaults: Record<Shape, [number, number, number]> = {
      rectangle: [12, 8, 5],
      square: [6, 8, 5],
      circle: [5, 8, 5],
      triangle: [10, 6, 5],
      trapezoid: [8, 5, 4],
      parallelogram: [9, 5, 5],
      ellipse: [6, 4, 5],
    };
    const [da, db, dc] = defaults[s];
    this.a.set(da);
    this.b.set(db);
    this.c.set(dc);
  }
  setA(v: number) { this.a.set(this.clampNum(v, 0, 1000000000)); }
  setB(v: number) { this.b.set(this.clampNum(v, 0, 1000000000)); }
  setC(v: number) { this.c.set(this.clampNum(v, 0, 1000000000)); }

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
