import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-transistor-bias-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './transistor-bias-calculator.component.html',
  styleUrl: './transistor-bias-calculator.component.scss',
})
export class TransistorBiasCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt3().format(this.ic()) + this.t('labels.maUnit'));
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

  readonly slug = 'transistor-bias-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['resistor-color-code-calculator', 'voltage-drop-calculator', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly vcc = signal(12);
  readonly r1 = signal(47);
  readonly r2 = signal(10);
  readonly rc = signal(2.2);
  readonly re = signal(1);
  readonly beta = signal(100);

  readonly vb = computed(() => {
    const denom = this.r1() + this.r2();
    return denom > 0 ? (this.vcc() * this.r2()) / denom : 0;
  });
  readonly ve = computed(() => this.vb() - 0.7);
  readonly ie = computed(() => {
    const re = this.re();
    return re > 0 ? this.ve() / re : 0;
  });
  readonly ic = computed(() => this.ie());
  readonly vce = computed(() => this.vcc() - this.ic() * (this.rc() + this.re()));
  readonly vc = computed(() => this.vcc() - this.ic() * this.rc());
  readonly icsat = computed(() => {
    const denom = this.rc() + this.re();
    return denom > 0 ? this.vcc() / denom : 0;
  });
  readonly state = computed(() =>
    this.vce() > 0.2 ? this.t('labels.stateActive') : this.t('labels.stateSat')
  );
  readonly stable = computed(() => this.r2() <= (this.beta() * this.re()) / 10);

  readonly fmt2 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
  readonly fmt3 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })
  );

  setVcc(v: number) { this.vcc.set(this.clampNum(v, 1, 100)); }
  setR1(v: number) { this.r1.set(this.clampNum(v, 0.1, 10000)); }
  setR2(v: number) { this.r2.set(this.clampNum(v, 0.1, 10000)); }
  setRc(v: number) { this.rc.set(this.clampNum(v, 0.01, 1000)); }
  setRe(v: number) { this.re.set(this.clampNum(v, 0.01, 1000)); }
  setBeta(v: number) { this.beta.set(this.clampNum(v, 10, 1000)); }


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
