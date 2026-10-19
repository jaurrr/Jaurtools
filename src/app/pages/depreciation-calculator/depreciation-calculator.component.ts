import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type DepMethod = 'straight' | 'declining';

interface ScheduleRow { year: number; dep: number; book: number; }

@Component({
  selector: 'app-depreciation-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './depreciation-calculator.component.html',
  styleUrl: './depreciation-calculator.component.scss',
})
export class DepreciationCalculatorComponent implements OnDestroy {
  readonly slug = 'depreciation-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['compound-interest-calculator', 'fixed-deposit-calculator', 'electricity-cost-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly cost = signal(100000);
  readonly salvage = signal(10000);
  readonly life = signal(5);
  readonly method = signal<DepMethod>('straight');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private round2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  readonly schedule = computed<ScheduleRow[]>(() => {
    const cost = this.cost();
    const salvage = Math.min(this.salvage(), cost);
    const life = Math.max(Math.round(this.life()), 1);
    const rows: ScheduleRow[] = [];
    if (this.method() === 'straight') {
      const annual = Math.max(cost - salvage, 0) / life;
      for (let y = 1; y <= life; y++) {
        rows.push({ year: y, dep: this.round2(annual), book: this.round2(Math.max(cost - annual * y, salvage)) });
      }
    } else {
      const rate = 2 / life;
      let book = cost;
      for (let y = 1; y <= life; y++) {
        const dep = this.round2(Math.min(rate * book, Math.max(book - salvage, 0)));
        book = this.round2(book - dep);
        rows.push({ year: y, dep, book });
      }
    }
    return rows;
  });

  readonly annualDep = computed(() => {
    const s = this.schedule();
    return s.length > 0 ? s[0].dep : 0;
  });

  readonly totalDep = computed(() => {
    const s = this.schedule();
    return s.length > 0 ? this.round2(this.cost() - s[s.length - 1].book) : 0;
  });

  readonly moneyFmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  readonly finalBook = computed(() => {
    const s = this.schedule();
    return s.length > 0 ? s[s.length - 1].book : 0;
  });

  readonly bars = computed(() => {
    const s = this.schedule();
    const max = Math.max(1, ...s.map((r) => r.dep));
    const step = Math.max(1, Math.ceil(s.length / 12));
    return s.map((r) => ({
      year: r.year,
      height: (r.dep / max) * 100,
      showLabel: r.year === 1 || r.year === s.length || r.year % step === 1,
    }));
  });

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
  }

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

  setMethod(m: DepMethod) { this.method.set(m); }
  setCost(v: number) { this.cost.set(this.clampNum(v, 0, 1000000000)); }
  setSalvage(v: number) { this.salvage.set(this.clampNum(v, 0, 1000000000)); }
  setLife(v: number) { this.life.set(Math.round(this.clampNum(v, 1, 40))); }

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
