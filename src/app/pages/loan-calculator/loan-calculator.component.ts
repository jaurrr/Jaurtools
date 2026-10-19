import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ScheduleRow {
  year: number;
  principal: number;
  interest: number;
  balance: number;
}

const TYPE_RATES: Record<string, number> = {
  home: 8.5,
  personal: 11,
  auto: 9,
};

@Component({
  selector: 'app-loan-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './loan-calculator.component.html',
  styleUrl: './loan-calculator.component.scss',
})
export class LoanCalculatorComponent implements OnDestroy {
  readonly slug = 'loan-calculator';
  readonly related = ['emi-calculator', 'sip-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly loanTypes = ['home', 'personal', 'auto'];
  readonly loanType = signal('home');
  readonly amount = signal(500000);
  readonly rate = signal(8.5);
  readonly years = signal(20);

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
    });
  }

  ngOnDestroy(): void {
    this.document.querySelectorAll('[data-seo-page]').forEach((el) => el.remove());
  }

  t(key: string): string {
    this.translate.lang();
    const raw = this.translate.t(`${this.slug}.${key}`);
    return typeof raw === 'string' ? raw : key;
  }

  tp(key: string, params: Record<string, string | number>): string {
    let s = this.t(key);
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
    return s;
  }

  list(key: string): string[] {
    this.translate.lang();
    const raw = this.translate.t(`${this.slug}.${key}`);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.translate.t(`${this.slug}.faqs`);
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  onTypeChange(type: string): void {
    this.loanType.set(type);
    const preset = TYPE_RATES[type];
    if (preset != null) this.setRate(preset);
  }

  setAmount(v: number): void { this.amount.set(this.clampNum(v, 10000, 100000000)); }
  setRate(v: number): void { this.rate.set(this.clampNum(v, 0, 30)); }
  setYears(v: number): void { this.years.set(this.clampNum(v, 1, 30)); }

  private clampNum(v: number, min: number, max: number): number {
    if (!isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
  );

  private locale(): string {
    const lang = this.translate.lang();
    return lang === 'hi' ? 'en-IN' : lang === 'ar' ? 'ar-SA' : 'en-US';
  }

  readonly emi = computed((): number => {
    const principal = this.amount();
    const annual = this.rate();
    const yrs = this.years();
    const months = Math.max(1, Math.round(yrs * 12));
    const r = annual / 1200;
    if (r === 0) return principal / months;
    const f = Math.pow(1 + r, months);
    return (principal * r * f) / (f - 1);
  });

  readonly totals = computed(() => {
    const principal = this.amount();
    const months = Math.max(1, Math.round(this.years() * 12));
    const payable = this.emi() * months;
    return { payable, interest: payable - principal };
  });

  readonly schedule = computed((): ScheduleRow[] => {
    const principal = this.amount();
    const annual = this.rate();
    const yrs = this.years();
    const monthly = this.emi();
    const r = annual / 1200;
    const totalYears = Math.min(30, Math.max(1, Math.round(yrs)));
    let balance = principal;
    const rows: ScheduleRow[] = [];
    for (let year = 1; year <= totalYears; year++) {
      let princ = 0;
      let intr = 0;
      for (let m = 0; m < 12 && balance > 0.005; m++) {
        const i = balance * r;
        const p = Math.min(monthly - i, balance);
        intr += i;
        princ += p;
        balance -= p;
      }
      rows.push({ year, principal: princ, interest: intr, balance: Math.max(balance, 0) });
      if (balance <= 0.005) break;
    }
    return rows;
  });

  readonly payMonths = computed(() => Math.max(1, Math.round(this.years() * 12)));

  readonly extraPayoff = computed(() => {
    const r = this.rate() / 1200;
    const n = this.payMonths();
    const emi = this.emi();
    const principal = this.amount();
    if (!(r > 0) || !(emi > 0) || !(principal > 0)) return { months: 0, saved: 0 };
    const pay = emi + emi / 12;
    let bal = principal, months = 0, intPaid = 0;
    while (bal > 0 && months < 3600) {
      const it = bal * r;
      intPaid += it;
      bal = bal + it - pay;
      months++;
    }
    const totalInt = emi * n - principal;
    return { months: Math.max(0, n - months), saved: Math.max(0, totalInt - intPaid) };
  });

  readonly refGrid = computed(() => {
    const r = 8.5 / 1200;
    const f = this.fmt();
    const amounts = [500000, 1000000, 2000000, 5000000];
    const tenures = [10, 15, 20, 25];
    const cells = amounts.map((amt) =>
      tenures.map((y) => {
        const n = y * 12;
        const fac = Math.pow(1 + r, n);
        const emi = (amt * r * fac) / (fac - 1);
        return f.format(emi);
      })
    );
    return { amounts, tenures, cells };
  });

  private updateSeo(): void {
    const lang = this.translate.lang();
    const base = 'https://jaurtools.com';
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.setLink('canonical', `${base}/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink(`hreflang-${l}`, `${base}/${l}/${this.slug}`, l);
    }
    this.setLink('hreflang-default', `${base}/en/${this.slug}`, 'x-default');
  }

  private setLink(id: string, href: string, hreflang?: string): void {
    const doc = this.document;
    doc.querySelector(`link[data-seo-page="seo-${id}"]`)?.remove();
    const link = doc.createElement('link');
    link.setAttribute('data-seo-page', `seo-${id}`);
    link.rel = id === 'canonical' ? 'canonical' : 'alternate';
    if (hreflang) link.hreflang = hreflang;
    link.href = href;
    doc.head.appendChild(link);
  }
}
