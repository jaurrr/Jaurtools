import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-quadratic-formula-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './quadratic-formula-calculator.component.html',
  styleUrl: './quadratic-formula-calculator.component.scss',
})
export class QuadraticFormulaCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.root1());
  copyMain(): void {
    const text = String(this.copyText());
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

  readonly slug = 'quadratic-formula-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = [
    'pythagorean-theorem-calculator',
    'right-triangle-calculator',
    'root-calculator',
    'rounding-calculator',
  ];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly a = signal(1);
  readonly b = signal(-3);
  readonly c = signal(2);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly discriminant = computed(() => {
    const a = this.a();
    if (a === 0) return null;
    return this.b() * this.b() - 4 * a * this.c();
  });

  readonly nature = computed(() => {
    const d = this.discriminant();
    if (d === null) return null;
    if (d > 0) return 'two';
    if (d === 0) return 'one';
    return 'complex';
  });

  readonly root1 = computed((): string | null => {
    const a = this.a();
    const d = this.discriminant();
    if (d === null) return null;
    const twoA = 2 * a;
    if (d >= 0) return this.fmt6().format((-this.b() + Math.sqrt(d)) / twoA);
    const re = -this.b() / twoA;
    const im = Math.sqrt(-d) / twoA;
    return `${this.fmt6().format(re)} + ${this.fmt6().format(im)}i`;
  });

  readonly root2 = computed((): string | null => {
    const a = this.a();
    const d = this.discriminant();
    if (d === null) return null;
    const twoA = 2 * a;
    if (d >= 0) return this.fmt6().format((-this.b() - Math.sqrt(d)) / twoA);
    const re = -this.b() / twoA;
    const im = Math.sqrt(-d) / twoA;
    return `${this.fmt6().format(re)} - ${this.fmt6().format(im)}i`;
  });

  readonly vertex = computed(() => {
    const a = this.a();
    if (a === 0) return null;
    const h = -this.b() / (2 * a);
    const k = this.c() - (this.b() * this.b()) / (4 * a);
    return { h: this.fmt6().format(h), k: this.fmt6().format(k) };
  });

  readonly fmt6 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      })
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

  setA(v: number) {
    this.a.set(this.clampNum(v, -1000000, 1000000));
  }

  setB(v: number) {
    this.b.set(this.clampNum(v, -1000000, 1000000));
  }

  setC(v: number) {
    this.c.set(this.clampNum(v, -1000000, 1000000));
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
