import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;
const EARTH_KM = 6371;

@Component({
  selector: 'app-qibla-direction-finder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './qibla-direction-finder.component.html',
  styleUrl: './qibla-direction-finder.component.scss',
})
export class QiblaDirectionFinderComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.oneDecimal().format(this.bearing()) + "\u00b0" + this.compassPoint());
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

  readonly slug = 'qibla-direction-finder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sun-position-calculator', 'wind-chill-calculator', 'zoom-level-to-map-scale-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly lat = signal(17.385);
  readonly lon = signal(78.4867);
  readonly geoState = signal<'idle' | 'locating' | 'denied' | 'unavailable' | 'timeout'>('idle');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly rad = computed(() => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    return {
      phi1: toRad(this.lat()),
      phi2: toRad(KAABA_LAT),
      dLambda: toRad(KAABA_LON - this.lon()),
      dPhi: toRad(KAABA_LAT - this.lat()),
    };
  });

  readonly bearing = computed(() => {
    const r = this.rad();
    const y = Math.sin(r.dLambda);
    const x = Math.cos(r.phi1) * Math.tan(r.phi2) - Math.sin(r.phi1) * Math.cos(r.dLambda);
    const theta = Math.atan2(y, x);
    return ((theta * 180) / Math.PI + 360) % 360;
  });

  readonly distanceKm = computed(() => {
    const r = this.rad();
    const a =
      Math.sin(r.dPhi / 2) ** 2 +
      Math.cos(r.phi1) * Math.cos(r.phi2) * Math.sin(r.dLambda / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  });

  readonly compassPoint = computed(() => {
    const pts = this.list('labels.compass');
    if (pts.length !== 16) return '';
    return pts[Math.round(this.bearing() / 22.5) % 16];
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  readonly whole = computed(() => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 0 }));

  useLocation() {
    if (!('geolocation' in navigator)) {
      this.geoState.set('unavailable');
      return;
    }
    this.geoState.set('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.lat.set(this.clampNum(pos.coords.latitude, -90, 90));
        this.lon.set(this.clampNum(pos.coords.longitude, -180, 180));
        this.geoState.set('idle');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.geoState.set('denied');
        else if (err.code === err.TIMEOUT) this.geoState.set('timeout');
        else this.geoState.set('unavailable');
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  }

  setLat(v: number) { this.lat.set(this.clampNum(v, -90, 90)); }
  setLon(v: number) { this.lon.set(this.clampNum(v, -180, 180)); }

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
