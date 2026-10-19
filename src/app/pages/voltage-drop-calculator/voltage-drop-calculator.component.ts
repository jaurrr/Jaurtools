import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-voltage-drop-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './voltage-drop-calculator.component.html',
  styleUrl: './voltage-drop-calculator.component.scss',
})
export class VoltageDropCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt2().format(this.drop()) + this.t('labels.vUnit') + "(" + this.fmt2().format(this.dropPct()) + "%)");
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

  readonly slug = 'voltage-drop-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['resistor-color-code-calculator', 'transistor-bias-calculator', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly voltage = signal(230);
  readonly phase = signal<'single' | 'three'>('single');
  readonly material = signal<'copper' | 'aluminum'>('copper');
  readonly wireSize = signal(2.5);
  readonly length = signal(30);
  readonly current = signal(16);

  readonly rho = computed(() => (this.material() === 'copper' ? 0.0172 : 0.0282));
  readonly kFactor = computed(() => (this.phase() === 'single' ? 2 : Math.sqrt(3)));

  readonly drop = computed(() => {
    const a = this.wireSize();
    if (a <= 0) return 0;
    return (this.kFactor() * this.rho() * this.length() * this.current()) / a;
  });
  readonly dropPct = computed(() => {
    const v = this.voltage();
    return v > 0 ? (this.drop() / v) * 100 : 0;
  });
  readonly loadVoltage = computed(() => this.voltage() - this.drop());
  readonly maxCurrent = computed(() => {
    const denom = this.kFactor() * this.rho() * this.length();
    return denom > 0 ? (0.05 * this.voltage() * this.wireSize()) / denom : 0;
  });
  readonly verdict = computed(() => {
    const p = this.dropPct();
    if (p <= 3) return this.t('labels.okLabel');
    if (p <= 5) return this.t('labels.warnLabel');
    return this.t('labels.badLabel');
  });

  readonly fmt2 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
  readonly fmt1 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
  );

  setVoltage(v: number) { this.voltage.set(this.clampNum(v, 1, 11000)); }
  setPhase(p: 'single' | 'three') { this.phase.set(p); }
  setMaterial(m: 'copper' | 'aluminum') { this.material.set(m); }
  setWireSize(v: number) { this.wireSize.set(this.clampNum(v, 0.5, 1000)); }
  setLength(v: number) { this.length.set(this.clampNum(v, 0.5, 5000)); }
  setCurrent(v: number) { this.current.set(this.clampNum(v, 0, 2000)); }


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
