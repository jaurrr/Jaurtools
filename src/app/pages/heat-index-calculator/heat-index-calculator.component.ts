import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-heat-index-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './heat-index-calculator.component.html',
  styleUrl: './heat-index-calculator.component.scss',
})
export class HeatIndexCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.heatIndex()) + "&deg;" + this.unit());
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

  readonly slug = 'heat-index-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['temperature-converter', 'wind-chill-calculator', 'dew-point-calculator', 'humidity-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly unit = signal<'F' | 'C'>('F');
  readonly temp = signal(90);
  readonly humidity = signal(60);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly tempF = computed(() =>
    this.unit() === 'F' ? this.temp() : this.temp() * 9 / 5 + 32
  );

  readonly heatIndexF = computed(() => {
    const t = this.tempF(), r = this.humidity();
    if (t < 80) return t;
    let hi = -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r
      - 0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r
      + 0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
    if (r < 13 && t >= 80 && t <= 112) {
      hi -= ((13 - r) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (r > 85 && t >= 80 && t <= 87) {
      hi += ((r - 85) / 10) * ((87 - t) / 5);
    }
    return hi;
  });

  readonly heatIndex = computed(() =>
    this.unit() === 'F' ? this.heatIndexF() : (this.heatIndexF() - 32) * 5 / 9
  );

  readonly applies = computed(() => this.tempF() >= 80);

  readonly risk = computed((): string => {
    const f = this.heatIndexF();
    if (f < 80) return 'low';
    if (f < 91) return 'caution';
    if (f < 103) return 'extreme-caution';
    if (f < 125) return 'danger';
    return 'extreme-danger';
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

  setUnit(u: 'F' | 'C') {
    if (u === this.unit()) return;
    const f = this.tempF();
    this.unit.set(u);
    this.temp.set(u === 'F' ? this.clampNum(f, -40, 130) : this.clampNum(Math.round(((f - 32) * 5 / 9) * 10) / 10, -40, 55));
  }
  setTemp(v: number) {
    this.temp.set(this.unit() === 'F' ? this.clampNum(v, -40, 130) : this.clampNum(v, -40, 55));
  }
  setHumidity(v: number) { this.humidity.set(this.clampNum(v, 0, 100)); }

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
