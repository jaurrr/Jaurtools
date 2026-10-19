import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-sip-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './sip-calculator.component.html',
  styleUrl: './sip-calculator.component.scss',
})
export class SipCalculatorComponent implements OnDestroy {
  readonly slug = 'sip-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['emi-calculator', 'loan-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly monthly = signal(5000);
  readonly annualRate = signal(12);
  readonly years = signal(10);

  // Dual mode: build a corpus from a monthly SIP, or solve the monthly SIP a goal needs.
  readonly mode = signal<'sip' | 'goal'>('sip');
  readonly goalAmount = signal(10000000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly results = computed(() => {
    const r = this.annualRate() / 1200;
    const n = Math.round(this.years() * 12);
    const m = this.monthly();
    const invested = m * n;
    if (r <= 0) return { invested, gains: 0, total: invested };
    const fv = m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    return { invested, gains: fv - invested, total: fv };
  });

  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
  );

  // Monthly SIP needed to hit the goal (annuity-due solve: FV = m * (((1+r)^n - 1) / r) * (1 + r)).
  readonly requiredMonthly = computed(() => {
    const r = this.annualRate() / 1200;
    const n = Math.max(1, Math.round(this.years() * 12));
    const goal = this.goalAmount();
    if (r <= 0) return goal / n;
    return (goal * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
  });

  // One view model for both modes so the whole page (hero, donut, schedule) follows the tab.
  readonly display = computed(() => {
    if (this.mode() === 'goal') {
      const m = this.requiredMonthly();
      const n = Math.max(1, Math.round(this.years() * 12));
      const r = this.annualRate() / 1200;
      const invested = m * n;
      const total = r <= 0 ? invested : m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
      return { monthly: m, invested, gains: total - invested, total };
    }
    const res = this.results();
    return { monthly: this.monthly(), invested: res.invested, gains: res.gains, total: res.total };
  });

  readonly schedule = computed(() => {
    const r = this.annualRate() / 1200;
    const yrs = Math.max(1, Math.round(this.years()));
    const m = this.display().monthly;
    const rows: { year: number; invested: number; value: number; growth: number }[] = [];
    for (let y = 1; y <= yrs; y++) {
      const n = y * 12;
      const invested = m * n;
      const value = r <= 0 ? invested : m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
      rows.push({ year: y, invested, value, growth: value - invested });
    }
    return rows;
  });

  // Auto insight: what does +Rs.1,000/month change?
  readonly insight = computed(() => {
    const f = this.fmt();
    const r = this.annualRate() / 1200;
    const n = Math.max(1, Math.round(this.years() * 12));
    if (this.mode() === 'sip') {
      const extra = r <= 0 ? 1000 * n : 1000 * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
      return { gain: f.format(extra), months: 0 };
    }
    const m2 = this.requiredMonthly() + 1000;
    const goal = this.goalAmount();
    let months: number;
    if (r <= 0 || m2 <= 0) {
      months = Math.ceil(goal / Math.max(1, m2));
    } else {
      months = Math.ceil(Math.log((goal / (m2 * (1 + r))) * r + 1) / Math.log(1 + r));
    }
    return { gain: '', months: Math.max(0, n - months) };
  });

  // Precomputed reference: monthly SIP x horizon at 12% annual.
  readonly refTable = computed(() => {
    const r = 0.12 / 12;
    const amounts = [5000, 10000, 20000];
    const horizons = [10, 15, 20];
    const f = this.fmt();
    return {
      amounts: amounts.map((a) => f.format(a)),
      horizons,
      cells: amounts.map((a) =>
        horizons.map((y) => {
          const n = y * 12;
          return f.format(a * ((Math.pow(1 + r, n) - 1) / r) * (1 + r));
        }),
      ),
    };
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
    const raw = this.lookupOther(slug, 'name');
    return typeof raw === 'string' ? raw : slug;
  }

  setMonthly(v: number) { this.monthly.set(this.clampNum(v, 500, 100000)); }
  setRate(v: number) { this.annualRate.set(this.clampNum(v, 0, 30)); }
  setYears(v: number) { this.years.set(this.clampNum(v, 1, 40)); }
  setGoal(v: number) { this.goalAmount.set(this.clampNum(v, 100000, 1000000000)); }
  setMode(m: 'sip' | 'goal') { this.mode.set(m); }

  // Template interpolation for tip/meaning strings: replaces {key} tokens.
  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
    return s;
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

  private lookupOther(slug: string, key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${slug}.${key}`);
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
