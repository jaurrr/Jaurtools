import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface MwItem {
  el: string;
  count: number;
  weight: number;
  subtotal: number;
}

interface ParsedFormula {
  items: MwItem[];
  error: '' | 'invalid' | 'unknown';
  element: string;
}

const ATOMIC: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007,
  O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974,
  S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Ti: 47.867, V: 50.942,
  Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904,
  Sr: 87.62, Ag: 107.87, Cd: 112.41, Sn: 118.71, Sb: 121.76, I: 126.9,
  Ba: 137.33, W: 183.84, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, U: 238.03,
};

@Component({
  selector: 'app-molecular-weight-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './molecular-weight-calculator.component.html',
  styleUrl: './molecular-weight-calculator.component.scss',
})
export class MolecularWeightCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.threeDecimal().format(this.moles()) + this.t('labels.molUnit'));
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

  readonly slug = 'molecular-weight-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['unit-converter', 'percentage-calculator', 'bmi-calculator', 'macro-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly formula = signal('H2SO4');
  readonly grams = signal(49.04);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed(() => this.parseFormula(this.formula()));

  readonly molecularWeight = computed(() =>
    this.parsed().items.reduce((sum, item) => sum + item.subtotal, 0)
  );

  readonly moles = computed(() => {
    const mw = this.molecularWeight();
    return mw > 0 ? this.grams() / mw : 0;
  });

  readonly errorMsg = computed(() => {
    const p = this.parsed();
    if (!p.error) return '';
    if (p.error === 'unknown') {
      return this.t('labels.errorUnknown').replace('{el}', p.element);
    }
    return this.t('labels.errorInvalid');
  });

  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  readonly threeDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 })
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

  setFormula(v: string) { this.formula.set((v ?? '').slice(0, 60)); }
  setGrams(v: number) { this.grams.set(this.clampNum(v, 0, 1000000)); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseFormula(input: string): ParsedFormula {
    const empty: ParsedFormula = { items: [], error: 'invalid', element: '' };
    const cleaned = (input ?? '').replace(/\s+/g, '');
    if (!cleaned || !/^[A-Za-z0-9()]+$/.test(cleaned)) return empty;
    const tokens = cleaned.match(/([A-Z][a-z]?|\(|\)|\d+)/g);
    if (!tokens || tokens.join('') !== cleaned) return empty;

    const stack: Map<string, number>[] = [new Map()];
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '(') {
        stack.push(new Map());
        i++;
      } else if (tok === ')') {
        i++;
        let mult = 1;
        if (i < tokens.length && /^\d+$/.test(tokens[i])) {
          mult = parseInt(tokens[i], 10);
          i++;
        }
        const top = stack.pop();
        if (!top || stack.length === 0 || !Number.isFinite(mult) || mult > 100000) return empty;
        const cur = stack[stack.length - 1];
        top.forEach((c, el) => cur.set(el, (cur.get(el) ?? 0) + c * mult));
      } else if (/^[A-Z]/.test(tok)) {
        i++;
        let count = 1;
        if (i < tokens.length && /^\d+$/.test(tokens[i])) {
          count = parseInt(tokens[i], 10);
          i++;
        }
        if (!Number.isFinite(count) || count > 100000) return empty;
        if (!(tok in ATOMIC)) return { items: [], error: 'unknown', element: tok };
        const cur = stack[stack.length - 1];
        cur.set(tok, (cur.get(tok) ?? 0) + count);
      } else {
        return empty;
      }
    }
    if (stack.length !== 1) return empty;
    const items: MwItem[] = [];
    stack[0].forEach((count, el) => {
      const weight = ATOMIC[el];
      items.push({ el, count, weight, subtotal: weight * count });
    });
    if (items.length === 0) return empty;
    items.sort((a, b) => a.el.localeCompare(b.el));
    return { items, error: '', element: '' };
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
