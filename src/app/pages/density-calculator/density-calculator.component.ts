import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SolveFor = 'density' | 'mass' | 'volume';
type MassUnit = 'g' | 'kg';
type VolUnit = 'cm3' | 'mL' | 'L';

const MASS_TO_G: Record<MassUnit, number> = { g: 1, kg: 1000 };
const VOL_TO_CM3: Record<VolUnit, number> = { cm3: 1, mL: 1, L: 1000 };

@Component({
  selector: 'app-density-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './density-calculator.component.html',
  styleUrl: './density-calculator.component.scss',
})
export class DensityCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fourDecimal().format(this.resultDensity()) + "g/cm\u00b3");
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

  readonly slug = 'density-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cbm-calculator', 'bandwidth-calculator', 'concrete-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly solveFor = signal<SolveFor>('density');
  readonly mass = signal(500);
  readonly massUnit = signal<MassUnit>('g');
  readonly volume = signal(250);
  readonly volUnit = signal<VolUnit>('cm3');
  readonly density = signal(2);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly resultDensity = computed(() => {
    const m = this.mass() * MASS_TO_G[this.massUnit()];
    const v = this.volume() * VOL_TO_CM3[this.volUnit()];
    if (m <= 0 || v <= 0) return 0;
    return m / v;
  });

  readonly resultMass = computed(() => {
    const d = this.density();
    const v = this.volume() * VOL_TO_CM3[this.volUnit()];
    if (d <= 0 || v <= 0) return 0;
    return d * v;
  });

  readonly resultVolume = computed(() => {
    const d = this.density();
    const m = this.mass() * MASS_TO_G[this.massUnit()];
    if (d <= 0 || m <= 0) return 0;
    return m / d;
  });

  readonly massUnits: MassUnit[] = ['g', 'kg'];
  readonly volUnits: VolUnit[] = ['cm3', 'mL', 'L'];
  readonly solveOptions: SolveFor[] = ['density', 'mass', 'volume'];

  readonly fourDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 })
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

  setSolveFor(s: SolveFor) { this.solveFor.set(s); }
  setMass(v: number) { this.mass.set(this.clampNum(v, 0.001, 1e9)); }
  setMassUnit(u: MassUnit) { this.massUnit.set(u); }
  setVolume(v: number) { this.volume.set(this.clampNum(v, 0.001, 1e9)); }
  setVolUnit(u: VolUnit) { this.volUnit.set(u); }
  setDensity(v: number) { this.density.set(this.clampNum(v, 0.0001, 1e6)); }

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
    return Math.min(max, Math.max(min, v));
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
