import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface DivStep {
  current: number;
  q: number;
  sub: number;
  rem: number;
  digit: number;
  last: boolean;
}

@Component({
  selector: 'app-long-division-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './long-division-calculator.component.html',
  styleUrl: './long-division-calculator.component.scss',
})
export class LongDivisionCalculatorComponent implements OnDestroy {
  readonly slug = 'long-division-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fraction-calculator', 'factor-calculator', 'gcf-calculator', 'lcm-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly dividend = signal(154);
  readonly divisor = signal(7);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly calc = computed(() => {
    const a = this.dividend(), b = this.divisor();
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= 0) return null;
    const digits = String(Math.floor(a)).split('').map((d) => Number(d));
    const steps: DivStep[] = [];
    const qDigits: number[] = [];
    let current = 0;
    digits.forEach((digit, i) => {
      current = current * 10 + digit;
      const q = Math.floor(current / b);
      const sub = q * b;
      const rem = current - sub;
      qDigits.push(q);
      steps.push({ current, q, sub, rem, digit, last: i === digits.length - 1 });
      current = rem;
    });
    const quotient = Number(qDigits.join(''));
    return { steps, quotient, remainder: current, digits, qDigits };
  });

  readonly stepLines = computed(() => {
    this.translate.lang();
    const c = this.calc();
    if (!c) return [];
    const L = (k: string) => {
      const raw = (this.translate.t as unknown as (x: string) => unknown)(`${this.slug}.labels.${k}`);
      return typeof raw === 'string' ? raw : k;
    };
    const b = this.divisor();
    return c.steps.map((s) => {
      let line = `${L('stepInto')}: ${b} ${L('stepGoes')} ${s.current} -> ${s.q}; ${s.q} x ${b} = ${s.sub}; ${s.current} - ${s.sub} = ${s.rem}`;
      if (!s.last) line += `; ${L('stepBringDown')} ${c.digits[c.steps.indexOf(s) + 1]}`;
      return line;
    });
  });

  readonly checkLine = computed(() => {
    this.translate.lang();
    const c = this.calc();
    if (!c) return '';
    const L = (k: string) => {
      const raw = (this.translate.t as unknown as (x: string) => unknown)(`${this.slug}.labels.${k}`);
      return typeof raw === 'string' ? raw : k;
    };
    return `${L('stepCheck')}: ${this.dividend()} = ${this.divisor()} x ${c.quotient} + ${c.remainder}`;
  });

  readonly intFormat = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 })
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

  setDividend(v: number) { this.dividend.set(this.clampNum(v, 0, 999999999)); }
  setDivisor(v: number) { this.divisor.set(this.clampNum(v, 1, 999999999)); }

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
    return Math.min(max, Math.max(min, Math.floor(v)));
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
