import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-child-height-predictor',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './child-height-predictor.component.html',
  styleUrl: './child-height-predictor.component.scss',
})
export class ChildHeightPredictorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.display().mid) + this.display().unit);
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

  readonly slug = 'child-height-predictor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['bmi-calculator', 'body-type-calculator', 'ideal-weight-calculator', 'bmr-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'metric' | 'imperial'>('metric');
  readonly childGender = signal<'boy' | 'girl'>('boy');
  readonly fatherCm = signal(180);
  readonly motherCm = signal(165);
  readonly fatherFeet = signal(5);
  readonly fatherInches = signal(11);
  readonly motherFeet = signal(5);
  readonly motherInches = signal(5);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly parentsCm = computed(() => {
    if (this.unit() === 'metric') {
      return { father: this.fatherCm(), mother: this.motherCm() };
    }
    return {
      father: (this.fatherFeet() * 12 + this.fatherInches()) * 2.54,
      mother: (this.motherFeet() * 12 + this.motherInches()) * 2.54,
    };
  });

  readonly predictedCm = computed(() => {
    const p = this.parentsCm();
    const adj = this.childGender() === 'boy' ? 13 : -13;
    return (p.father + p.mother + adj) / 2;
  });

  readonly rangeLoCm = computed(() => this.predictedCm() - 8.5);
  readonly rangeHiCm = computed(() => this.predictedCm() + 8.5);

  readonly display = computed(() => {
    const cm = { lo: this.rangeLoCm(), mid: this.predictedCm(), hi: this.rangeHiCm() };
    if (this.unit() === 'metric') {
      return { lo: cm.lo, mid: cm.mid, hi: cm.hi, unit: this.t('labels.cmUnit') };
    }
    const toIn = (v: number) => v / 2.54;
    return { lo: toIn(cm.lo), mid: toIn(cm.mid), hi: toIn(cm.hi), unit: this.t('labels.inchUnit') };
  });

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

  setUnit(u: 'metric' | 'imperial') { this.unit.set(u); }
  setChildGender(g: 'boy' | 'girl') { this.childGender.set(g); }
  setFatherCm(v: number) { this.fatherCm.set(this.clampNum(v, 120, 220)); }
  setMotherCm(v: number) { this.motherCm.set(this.clampNum(v, 120, 220)); }
  setFatherFeet(v: number) { this.fatherFeet.set(this.clampNum(v, 4, 7)); }
  setFatherInches(v: number) { this.fatherInches.set(this.clampNum(v, 0, 11)); }
  setMotherFeet(v: number) { this.motherFeet.set(this.clampNum(v, 4, 7)); }
  setMotherInches(v: number) { this.motherInches.set(this.clampNum(v, 0, 11)); }

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
