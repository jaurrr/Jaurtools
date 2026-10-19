import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-speed-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './speed-calculator.component.html',
  styleUrl: './speed-calculator.component.scss',
})
export class SpeedCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmt2().format(this.speedEff()) + this.t('labels.kmhUnit'));
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

  readonly slug = 'speed-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tire-size-calculator', 'weight-on-planets-calculator', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly mode = signal<'speed' | 'distance' | 'time'>('speed');
  readonly distance = signal(100);
  readonly timeH = signal(1.5);
  readonly speedKmh = signal(60);

  readonly speedEff = computed(() => {
    if (this.mode() === 'speed') {
      const t = this.timeH();
      return t > 0 ? this.distance() / t : 0;
    }
    return this.speedKmh();
  });
  readonly distanceEff = computed(() =>
    this.mode() === 'distance' ? this.speedKmh() * this.timeH() : this.distance()
  );
  readonly timeEff = computed(() => {
    if (this.mode() === 'time') {
      const v = this.speedKmh();
      return v > 0 ? this.distance() / v : 0;
    }
    return this.timeH();
  });

  readonly speedMs = computed(() => this.speedEff() / 3.6);
  readonly speedMph = computed(() => this.speedEff() * 0.621371);
  readonly paceMinKm = computed(() => {
    const v = this.speedEff();
    return v > 0 ? 60 / v : 0;
  });
  readonly paceText = computed(() => {
    const p = this.paceMinKm();
    if (p <= 0) return '–';
    const m = Math.floor(p);
    const s = Math.round((p - m) * 60);
    return m + ':' + String(s).padStart(2, '0');
  });
  readonly distanceMiles = computed(() => this.distanceEff() * 0.621371);
  readonly timeMin = computed(() => this.timeEff() * 60);
  readonly timeHms = computed(() => {
    const t = this.timeEff();
    const h = Math.floor(t);
    const m = Math.round((t - h) * 60);
    return h + this.t('labels.hoursUnit') + ' ' + m + this.t('labels.minsUnit');
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

  setMode(m: 'speed' | 'distance' | 'time') { this.mode.set(m); }
  setDistance(v: number) { this.distance.set(this.clampNum(v, 0, 1000000)); }
  setTimeH(v: number) { this.timeH.set(this.clampNum(v, 0, 100000)); }
  setSpeedKmh(v: number) { this.speedKmh.set(this.clampNum(v, 0, 50000)); }


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
