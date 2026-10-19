import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-decimal-to-fraction-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './decimal-to-fraction-calculator.component.html',
  styleUrl: './decimal-to-fraction-calculator.component.scss',
})
export class DecimalToFractionCalculatorComponent implements OnDestroy {
  readonly slug = 'decimal-to-fraction-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-calculator', 'binary-calculator', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'dec2frac' | 'frac2dec'>('dec2frac');
  readonly decText = signal('0.75');
  readonly fracText = signal('3/4');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private gcd(a: number, b: number): number {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  readonly decResult = computed(() => {
    const s = this.decText().trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
    const ip = m[2] === '' ? '0' : m[2];
    const fp = m[3] ?? '';
    if (ip.replace(/^0+/, '').length + fp.length > 15) return null;
    let num = Number(ip + fp);
    let den = Math.pow(10, fp.length);
    const g = this.gcd(num, den);
    num = num / g;
    den = den / g;
    const neg = m[1] === '-' && num !== 0;
    const whole = Math.floor(num / den);
    const rem = num % den;
    const sign = neg ? '-' : '';
    const fraction = sign + num + '/' + den;
    const mixed = whole > 0 && rem > 0 ? sign + whole + ' ' + rem + '/' + den : fraction;
    return { fraction, mixed, hasMixed: whole > 0 && rem > 0 };
  });

  readonly fracResult = computed(() => {
    const s = this.fracText().trim();
    const m = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(s);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b === 0) return null;
    const neg = (a < 0) !== (b < 0) && a !== 0;
    let num = Math.abs(a);
    let den = Math.abs(b);
    const g = this.gcd(num, den);
    num = num / g;
    den = den / g;
    const sign = neg ? '-' : '';
    const whole = Math.floor(num / den);
    const rem = num % den;
    const fraction = sign + num + '/' + den;
    const mixed = whole > 0 && rem > 0 ? sign + whole + ' ' + rem + '/' + den : fraction;
    const decimal = String(parseFloat((a / b).toFixed(12)));
    return { fraction, mixed, decimal, hasMixed: whole > 0 && rem > 0 };
  });

  readonly quickRows = computed(() => [
    { dec: '0.5', q: this.t('labels.qaHalfQ'), a: '1/2' },
    { dec: '0.25', q: this.t('labels.qaQuarterQ'), a: '1/4' },
    { dec: '0.75', q: this.t('labels.qaThreeQuarterQ'), a: '3/4' },
    { dec: '0.33', q: this.t('labels.qaThirdQ'), a: '1/3' },
  ]);

  readonly refTable = computed(() => [
    { dec: '0.125', frac: '1/8' }, { dec: '0.25', frac: '1/4' }, { dec: '0.333', frac: '1/3' },
    { dec: '0.375', frac: '3/8' }, { dec: '0.5', frac: '1/2' }, { dec: '0.625', frac: '5/8' },
    { dec: '0.666', frac: '2/3' }, { dec: '0.75', frac: '3/4' }, { dec: '0.875', frac: '7/8' },
    { dec: '0.2', frac: '1/5' }, { dec: '0.4', frac: '2/5' }, { dec: '0.6', frac: '3/5' },
  ]);

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

  setMode(m: 'dec2frac' | 'frac2dec') { this.mode.set(m); }
  setDecText(v: string) { this.decText.set(v.slice(0, 40)); }
  setFracText(v: string) { this.fracText.set(v.slice(0, 40)); }

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
