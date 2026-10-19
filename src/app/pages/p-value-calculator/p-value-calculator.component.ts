import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type TestType = 'z' | 't';
type Tails = 'one' | 'two';

@Component({
  selector: 'app-p-value-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './p-value-calculator.component.html',
  styleUrl: './p-value-calculator.component.scss',
})
export class PValueCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.numFormat().format(this.pValue()!));
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

  readonly slug = 'p-value-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['mean-median-mode-range-calculator', 'min-max-of-a-list', 'log-calculator', 'number-sequence-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly tests: TestType[] = ['z', 't'];
  readonly tailsOpts: Tails[] = ['one', 'two'];
  readonly statistic = signal(1.96);
  readonly testType = signal<TestType>('z');
  readonly df = signal(10);
  readonly tails = signal<Tails>('two');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private erf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const s = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
    return s * y;
  }

  private phi(z: number): number {
    return 0.5 * (1 + this.erf(z / Math.SQRT2));
  }

  private lgamma(z: number): number {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.lgamma(1 - z);
    }
    z -= 1;
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  private betacf(a: number, b: number, x: number): number {
    const maxIter = 200;
    const eps = 3e-14;
    const fpmin = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < fpmin) d = fpmin;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      h *= d * c;
      aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  private ibeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.lgamma(a + b) - this.lgamma(a) - this.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return (bt * this.betacf(a, b, x)) / a;
    return 1 - (bt * this.betacf(b, a, 1 - x)) / b;
  }

  readonly pValue = computed(() => {
    const z = this.statistic();
    if (!Number.isFinite(z)) return null;
    const tails = this.tails();
    if (this.testType() === 'z') {
      const upper = 1 - this.phi(Math.abs(z));
      return tails === 'two' ? Math.min(1, 2 * upper) : upper;
    }
    const v = Math.floor(this.df());
    if (!Number.isFinite(v) || v < 1) return null;
    const t = Math.abs(z);
    const p = this.ibeta(v / (v + t * t), v / 2, 0.5);
    return tails === 'two' ? Math.min(1, p) : Math.min(1, p / 2);
  });

  readonly significant = computed(() => {
    const p = this.pValue();
    return p !== null && p < 0.05;
  });

  readonly numFormat = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 6 })
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

  setStatistic(v: number) { this.statistic.set(Number.isFinite(v) ? v : 0); }
  setTestType(t: TestType) { this.testType.set(t); }
  setDf(v: number) { this.df.set(Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 10); }
  setTails(t: Tails) { this.tails.set(t); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
