import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Method = 'snowball' | 'avalanche';

interface DebtInput { name: string; balance: number; apr: number; min: number; }

@Component({
  selector: 'app-debt-payoff-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './debt-payoff-calculator.component.html',
  styleUrl: './debt-payoff-calculator.component.scss',
})
export class DebtPayoffCalculatorComponent implements OnDestroy {
  readonly slug = 'debt-payoff-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['debt-consolidation-calculator', 'credit-card-payoff-calculator', 'debt-ratio-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly method = signal<Method>('snowball');
  readonly bal1 = signal(20000); readonly apr1 = signal(12); readonly min1 = signal(800);
  readonly bal2 = signal(60000); readonly apr2 = signal(24); readonly min2 = signal(2500);
  readonly bal3 = signal(0); readonly apr3 = signal(18); readonly min3 = signal(0);
  readonly extra = signal(5000);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private simulate(debts: DebtInput[], extra: number, method: Method) {
    const ds = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
    if (ds.length === 0) return { months: 0, interest: 0, order: [] as string[] };
    const budget = ds.reduce((s, d) => s + d.min, 0) + extra;
    let month = 0;
    let interest = 0;
    const order: string[] = [];
    while (ds.some((d) => d.balance > 0.01) && month < 1200) {
      month++;
      for (const d of ds) {
        if (d.balance > 0.01) {
          const it = (d.balance * d.apr) / 1200;
          d.balance += it;
          interest += it;
        }
      }
      const unpaid = ds.filter((d) => d.balance > 0.01);
      unpaid.sort((a, b) => (method === 'snowball' ? a.balance - b.balance : b.apr - a.apr));
      const target = unpaid[0];
      let paid = 0;
      for (const o of unpaid.slice(1)) {
        const p = Math.min(o.min, o.balance);
        o.balance -= p;
        paid += p;
      }
      const p = Math.min(Math.max(budget - paid, 0), target.balance);
      target.balance -= p;
      for (const d of ds) {
        if (d.balance <= 0.01 && !order.includes(d.name)) order.push(d.name);
      }
    }
    return { months: month, interest, order };
  }

  readonly debts = computed<DebtInput[]>(() => [
    { name: this.t('labels.debt1'), balance: this.bal1(), apr: this.apr1(), min: this.min1() },
    { name: this.t('labels.debt2'), balance: this.bal2(), apr: this.apr2(), min: this.min2() },
    { name: this.t('labels.debt3'), balance: this.bal3(), apr: this.apr3(), min: this.min3() },
  ]);

  readonly result = computed(() => this.simulate(this.debts(), this.extra(), this.method()));
  readonly altMethod = computed<Method>(() => (this.method() === 'snowball' ? 'avalanche' : 'snowball'));
  readonly altResult = computed(() => this.simulate(this.debts(), this.extra(), this.altMethod()));
  readonly orderText = computed(() => this.result().order.join(' → '));
  readonly altMethodName = computed(() => this.t('labels.' + this.altMethod()));

  readonly moneyFmt = computed(() =>
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

  setMethod(m: Method) { this.method.set(m); }
  setBal1(v: number) { this.bal1.set(this.clampNum(v, 0, 100000000)); }
  setApr1(v: number) { this.apr1.set(this.clampNum(v, 0, 60)); }
  setMin1(v: number) { this.min1.set(this.clampNum(v, 0, 1000000)); }
  setBal2(v: number) { this.bal2.set(this.clampNum(v, 0, 100000000)); }
  setApr2(v: number) { this.apr2.set(this.clampNum(v, 0, 60)); }
  setMin2(v: number) { this.min2.set(this.clampNum(v, 0, 1000000)); }
  setBal3(v: number) { this.bal3.set(this.clampNum(v, 0, 100000000)); }
  setApr3(v: number) { this.apr3.set(this.clampNum(v, 0, 60)); }
  setMin3(v: number) { this.min3.set(this.clampNum(v, 0, 1000000)); }
  setExtra(v: number) { this.extra.set(this.clampNum(v, 0, 1000000)); }

  // Template interpolation for meaning/tip strings: replaces {key} tokens.
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
