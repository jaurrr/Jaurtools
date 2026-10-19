import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-scientific-notation-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './scientific-notation-calculator.component.html',
  styleUrl: './scientific-notation-calculator.component.scss',
})
export class ScientificNotationCalculatorComponent implements OnDestroy {
  readonly slug = 'scientific-notation-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['scientific-calculator', 'percentage-calculator', 'number-to-words', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'toSci' | 'toNum'>('toSci');
  readonly numText = signal('0.0004526');
  readonly sig = signal(6);
  readonly mantText = signal('4.526');
  readonly expText = signal('-4');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsed = computed(() => {
    const v = parseFloat(this.numText().replace(/,/g, ''));
    return Number.isFinite(v) ? v : NaN;
  });

  readonly validNum = computed(() => Number.isFinite(this.parsed()));

  private readonly normalized = computed(() => {
    const x = this.parsed();
    if (!Number.isFinite(x)) return null;
    if (x === 0) return { m: 0, e: 0 };
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = x / Math.pow(10, e);
    m = parseFloat(m.toPrecision(this.sig()));
    if (Math.abs(m) >= 10) {
      m = m / 10;
      e = e + 1;
    }
    return { m, e };
  });

  readonly sciMantissa = computed(() => {
    const n = this.normalized();
    return n ? String(n.m) : '–';
  });

  readonly sciExponent = computed(() => {
    const n = this.normalized();
    return n ? n.e : 0;
  });

  readonly eNotation = computed(() => {
    const n = this.normalized();
    return n ? `${n.m}e${n.e}` : '–';
  });

  readonly engParts = computed(() => {
    const n = this.normalized();
    if (!n) return null;
    if (n.m === 0) return { m: '0', e: 0 };
    const e3 = 3 * Math.floor(n.e / 3);
    const m = parseFloat((n.m * Math.pow(10, n.e - e3)).toPrecision(this.sig()));
    return { m: String(m), e: e3 };
  });

  readonly mant = computed(() => {
    const v = parseFloat(this.mantText());
    return Number.isFinite(v) ? v : NaN;
  });

  readonly expn = computed(() => {
    const v = parseInt(this.expText().replace(/[^0-9+-]/g, ''), 10);
    return Number.isFinite(v) ? v : NaN;
  });

  readonly validParts = computed(() => Number.isFinite(this.mant()) && Number.isFinite(this.expn()));

  readonly decimalResult = computed(() => {
    if (!this.validParts()) return '–';
    const v = this.mant() * Math.pow(10, this.expn());
    if (!Number.isFinite(v)) return '–';
    return String(parseFloat(v.toPrecision(15)));
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
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setMode(m: 'toSci' | 'toNum') { this.mode.set(m); }
  setNumText(v: string) { this.numText.set(v.slice(0, 40)); }
  setSig(v: number) { this.sig.set(this.clampNum(v, 1, 15)); }
  setMantText(v: string) { this.mantText.set(v.slice(0, 40)); }
  setExpText(v: string) { this.expText.set(v.slice(0, 8)); }

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
    return Math.min(max, Math.max(min, Math.round(v)));
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
