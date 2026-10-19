import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Material = 'mulch' | 'gravel' | 'sand' | 'topsoil';

const LB_PER_CY: Record<Material, number> = {
  mulch: 500,
  gravel: 2800,
  sand: 2700,
  topsoil: 2000,
};

@Component({
  selector: 'app-material-estimator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './material-estimator.component.html',
  styleUrl: './material-estimator.component.scss',
})
export class MaterialEstimatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.twoDecimal().format(this.volumeCyWithWaste()));
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

  readonly slug = 'material-estimator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['concrete-calculator', 'cubic-feet-calculator', 'flooring-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'ft' | 'm'>('ft');
  readonly length = signal(20);
  readonly width = signal(10);
  readonly depth = signal(3);
  readonly material = signal<Material>('mulch');
  readonly waste = signal(10);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly dimsFt = computed(() => {
    if (this.unit() === 'ft') {
      return { l: this.length(), w: this.width(), dIn: this.depth() };
    }
    return { l: this.length() * 3.28084, w: this.width() * 3.28084, dIn: this.depth() / 2.54 };
  });

  readonly volumeCf = computed(() => {
    const d = this.dimsFt();
    if (d.l <= 0 || d.w <= 0 || d.dIn <= 0) return 0;
    return d.l * d.w * (d.dIn / 12);
  });

  readonly volumeCy = computed(() => this.volumeCf() / 27);

  readonly volumeCyWithWaste = computed(() => this.volumeCy() * (1 + this.waste() / 100));

  readonly tons = computed(() => (this.volumeCyWithWaste() * LB_PER_CY[this.material()]) / 2000);

  readonly bags = computed(() => this.volumeCf() * (1 + this.waste() / 100) / 2);

  readonly materials: Material[] = ['mulch', 'gravel', 'sand', 'topsoil'];

  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  setUnit(u: 'ft' | 'm') { this.unit.set(u); }
  setLength(v: number) { this.length.set(this.clampNum(v, 0.1, 10000)); }
  setWidth(v: number) { this.width.set(this.clampNum(v, 0.1, 10000)); }
  setDepth(v: number) { this.depth.set(this.clampNum(v, 0.1, 100)); }
  setWaste(v: number) { this.waste.set(this.clampNum(v, 0, 50)); }
  setMaterial(m: Material) { this.material.set(m); }

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
