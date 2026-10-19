import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';
const SHOE_CHART = [
  { uk: '3', usMen: '3.5', usWomen: '5', eu: '35.5', jp: '21.5' },
  { uk: '3.5', usMen: '4', usWomen: '5.5', eu: '36', jp: '22' },
  { uk: '4', usMen: '4.5', usWomen: '6', eu: '36.5', jp: '22.5' },
  { uk: '4.5', usMen: '5', usWomen: '6.5', eu: '37.5', jp: '23' },
  { uk: '5', usMen: '5.5', usWomen: '7', eu: '38', jp: '23.5' },
  { uk: '5.5', usMen: '6', usWomen: '7.5', eu: '38.5', jp: '24' },
  { uk: '6', usMen: '6.5', usWomen: '8', eu: '39.5', jp: '24.5' },
  { uk: '6.5', usMen: '7', usWomen: '8.5', eu: '40', jp: '25' },
  { uk: '7', usMen: '7.5', usWomen: '9', eu: '40.5', jp: '25.5' },
  { uk: '7.5', usMen: '8', usWomen: '9.5', eu: '41', jp: '26' },
  { uk: '8', usMen: '8.5', usWomen: '10', eu: '42', jp: '26.5' },
  { uk: '8.5', usMen: '9', usWomen: '10.5', eu: '42.5', jp: '27' },
  { uk: '9', usMen: '9.5', usWomen: '11', eu: '43', jp: '27.5' },
  { uk: '9.5', usMen: '10', usWomen: '11.5', eu: '44', jp: '28' },
  { uk: '10', usMen: '10.5', usWomen: '12', eu: '44.5', jp: '28.5' },
  { uk: '10.5', usMen: '11', usWomen: '12.5', eu: '45', jp: '29' },
  { uk: '11', usMen: '11.5', usWomen: '13', eu: '45.5', jp: '29.5' },
  { uk: '12', usMen: '12.5', usWomen: '14', eu: '46.5', jp: '30.5' },
  { uk: '13', usMen: '13.5', usWomen: '15', eu: '47.5', jp: '31.5' },
];

interface ShoeRow { uk: string; usMen: string; usWomen: string; eu: string; jp: string; }


@Component({
  selector: 'app-shoe-size-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './shoe-size-converter.component.html',
  styleUrl: './shoe-size-converter.component.scss',
})
export class ShoeSizeConverterComponent implements OnDestroy {
  readonly slug = 'shoe-size-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['length-converter', 'weight-converter', 'time-unit-converter', 'speed-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly system = signal<'uk' | 'usMen' | 'usWomen' | 'eu' | 'jp'>('eu');
  readonly size = signal('42');

  readonly systemOptions = computed(() => {
    this.translate.lang();
    const raw = this.lookup('systemOptions');
    return Array.isArray(raw) ? (raw as { id: string; name: string }[]) : [];
  });

  readonly chart: ShoeRow[] = SHOE_CHART;

  readonly match = computed(() => {
    const sys = this.system();
    const s = this.size().trim();
    return this.chart.find((r) => r[sys] === s) ?? null;
  });

  systemName(id: string): string {
    return this.systemOptions().find((o) => o.id === id)?.name ?? id;
  }

  setSystem(v: string) {
    if (v === 'uk' || v === 'usMen' || v === 'usWomen' || v === 'eu' || v === 'jp') {
      this.system.set(v);
    }
  }

  isActive(r: ShoeRow): boolean {
    const m = this.match();
    return m !== null && m.uk === r.uk;
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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
