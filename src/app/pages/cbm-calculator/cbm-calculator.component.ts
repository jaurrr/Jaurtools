import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-cbm-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './cbm-calculator.component.html',
  styleUrl: './cbm-calculator.component.scss',
})
export class CbmCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.threeDecimal().format(this.totalCbm()));
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

  readonly slug = 'cbm-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bandwidth-calculator', 'density-calculator', 'material-estimator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'cm' | 'm'>('cm');
  readonly length = signal(50);
  readonly width = signal(40);
  readonly height = signal(30);
  readonly quantity = signal(2);
  readonly weight = signal(10);
  readonly mode = signal<'air' | 'sea'>('air');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly dimsM = computed(() => {
    const f = this.unit() === 'cm' ? 0.01 : 1;
    return { l: this.length() * f, w: this.width() * f, h: this.height() * f };
  });

  readonly cbmPerPiece = computed(() => {
    const d = this.dimsM();
    if (d.l <= 0 || d.w <= 0 || d.h <= 0) return 0;
    return d.l * d.w * d.h;
  });

  readonly totalCbm = computed(() => this.cbmPerPiece() * Math.max(0, this.quantity()));

  readonly volumetricKg = computed(() => this.totalCbm() * (this.mode() === 'air' ? 167 : 1000));

  readonly actualKg = computed(() => Math.max(0, this.weight()) * Math.max(0, this.quantity()));

  readonly chargeableKg = computed(() => Math.max(this.volumetricKg(), this.actualKg()));

  readonly threeDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  );
  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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

  setUnit(u: 'cm' | 'm') { this.unit.set(u); }
  setLength(v: number) { this.length.set(this.clampNum(v, 0.1, 100000)); }
  setWidth(v: number) { this.width.set(this.clampNum(v, 0.1, 100000)); }
  setHeight(v: number) { this.height.set(this.clampNum(v, 0.1, 100000)); }
  setQuantity(v: number) { this.quantity.set(Math.round(this.clampNum(v, 1, 100000))); }
  setWeight(v: number) { this.weight.set(this.clampNum(v, 0, 1000000)); }
  setMode(m: 'air' | 'sea') { this.mode.set(m); }

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
