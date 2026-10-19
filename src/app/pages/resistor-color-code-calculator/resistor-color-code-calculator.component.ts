import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-resistor-color-code-calculator',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './resistor-color-code-calculator.component.html',
  styleUrl: './resistor-color-code-calculator.component.scss',
})
export class ResistorColorCodeCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.formatOhms(this.resistance()));
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

  readonly slug = 'resistor-color-code-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['voltage-drop-calculator', 'transistor-bias-calculator', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly bands = signal<4 | 5 | 6>(4);
  readonly bandColors = signal<string[]>(['yellow', 'violet', 'red', 'gold', '', '']);

  readonly colorKeys = [
    'black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue',
    'violet', 'gray', 'white', 'gold', 'silver', 'none',
  ];

  private readonly hexMap: Record<string, string> = {
    black: '#141414', brown: '#7c4a21', red: '#dc2626', orange: '#ea580c',
    yellow: '#facc15', green: '#16a34a', blue: '#2563eb', violet: '#7c3aed',
    gray: '#9ca3af', white: '#f8fafc', gold: '#d4a017', silver: '#c9ced6', none: 'transparent',
  };
  private readonly digitMap: Record<string, number> = {
    black: 0, brown: 1, red: 2, orange: 3, yellow: 4, green: 5,
    blue: 6, violet: 7, gray: 8, white: 9,
  };
  private readonly multMap: Record<string, number> = {
    black: 1, brown: 10, red: 100, orange: 1000, yellow: 10000,
    green: 100000, blue: 1000000, violet: 10000000, gray: 100000000,
    white: 1000000000, gold: 0.1, silver: 0.01,
  };
  private readonly tolMap: Record<string, number> = {
    brown: 1, red: 2, green: 0.5, blue: 0.25, violet: 0.1,
    gray: 0.05, gold: 5, silver: 10, none: 20,
  };
  private readonly ppmMap: Record<string, number> = {
    black: 250, brown: 100, red: 50, orange: 15, yellow: 25, blue: 10, violet: 5, white: 1,
  };

  readonly bandIndexes = computed(() =>
    Array.from({ length: this.bands() }, (_, i) => i)
  );

  readonly colorNames = computed(() => this.list('labels.colors'));

  readonly resistance = computed(() => {
    const cols = this.bandColors();
    const n = this.bands();
    const d = this.digitMap;
    let digits = 0;
    if (n === 4) {
      digits = (d[cols[0]] ?? 0) * 10 + (d[cols[1]] ?? 0);
    } else {
      digits = (d[cols[0]] ?? 0) * 100 + (d[cols[1]] ?? 0) * 10 + (d[cols[2]] ?? 0);
    }
    const multIdx = n === 4 ? 2 : 3;
    return digits * (this.multMap[cols[multIdx]] ?? 1);
  });

  readonly tolerance = computed(() => {
    const cols = this.bandColors();
    const idx = this.bands() === 4 ? 3 : 4;
    return this.tolMap[cols[idx]] ?? 20;
  });

  readonly ppm = computed(() => {
    if (this.bands() !== 6) return 0;
    return this.ppmMap[this.bandColors()[5]] ?? 0;
  });

  readonly rangeLo = computed(() => this.resistance() * (1 - this.tolerance() / 100));
  readonly rangeHi = computed(() => this.resistance() * (1 + this.tolerance() / 100));

  colorHex(key: string): string {
    return this.hexMap[key] ?? 'transparent';
  }
  colorName(key: string): string {
    const i = this.colorKeys.indexOf(key);
    const names = this.colorNames();
    return i >= 0 && names[i] ? names[i] : key;
  }
  bandRole(i: number): string {
    const n = this.bands();
    if (n === 4) {
      if (i === 0) return this.t('labels.roleDigit') + ' 1';
      if (i === 1) return this.t('labels.roleDigit') + ' 2';
      if (i === 2) return this.t('labels.roleMultiplier');
      return this.t('labels.roleTolerance');
    }
    if (i <= 2) return this.t('labels.roleDigit') + ' ' + (i + 1);
    if (i === 3) return this.t('labels.roleMultiplier');
    if (i === 4) return this.t('labels.roleTolerance');
    return this.t('labels.rolePpm');
  }
  bandChoices(i: number): string[] {
    const n = this.bands();
    const digits = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray', 'white'];
    const mults = [...digits, 'gold', 'silver'];
    const tols = ['brown', 'red', 'green', 'blue', 'violet', 'gray', 'gold', 'silver', 'none'];
    const ppms = ['black', 'brown', 'red', 'orange', 'yellow', 'blue', 'violet', 'white'];
    if (n === 4) return [digits, digits, mults, tols][i];
    if (i <= 2) return digits;
    if (i === 3) return mults;
    if (i === 4) return tols;
    return ppms;
  }
  setBands(n: 4 | 5 | 6) { this.bands.set(n); }
  setBand(i: number, color: string) {
    const cols = [...this.bandColors()];
    cols[i] = color;
    this.bandColors.set(cols);
  }

  formatOhms(v: number): string {
    const trim = (x: number) => {
      const r = Math.round(x * 100) / 100;
      return r.toLocaleString(this.locale(), { maximumFractionDigits: 2 });
    };
    if (v >= 1e9) return trim(v / 1e9) + ' GΩ';
    if (v >= 1e6) return trim(v / 1e6) + ' MΩ';
    if (v >= 1e3) return trim(v / 1e3) + ' kΩ';
    return trim(v) + ' Ω';
  }


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

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
      .replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
