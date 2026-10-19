import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type SizeUnit = 'MB' | 'GB' | 'TB';
type SpeedUnit = 'Mbps' | 'Gbps';

const BYTES: Record<SizeUnit, number> = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
const BPS: Record<SpeedUnit, number> = { Mbps: 1e6, Gbps: 1e9 };

@Component({
  selector: 'app-bandwidth-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './bandwidth-calculator.component.html',
  styleUrl: './bandwidth-calculator.component.scss',
})
export class BandwidthCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.formattedReal());
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

  readonly slug = 'bandwidth-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['cbm-calculator', 'density-calculator', 'unit-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly size = signal(1);
  readonly sizeUnit = signal<SizeUnit>('GB');
  readonly speed = signal(100);
  readonly speedUnit = signal<SpeedUnit>('Mbps');
  readonly overhead = signal(10);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly sizeBits = computed(() => {
    if (this.size() <= 0) return 0;
    return this.size() * BYTES[this.sizeUnit()] * 8;
  });

  readonly effectiveBps = computed(() => {
    if (this.speed() <= 0) return 0;
    return this.speed() * BPS[this.speedUnit()] * (1 - this.overhead() / 100);
  });

  readonly secondsIdeal = computed(() => {
    const bps = this.speed() * BPS[this.speedUnit()];
    if (this.sizeBits() <= 0 || bps <= 0) return 0;
    return this.sizeBits() / bps;
  });

  readonly secondsReal = computed(() => {
    if (this.sizeBits() <= 0 || this.effectiveBps() <= 0) return 0;
    return this.sizeBits() / this.effectiveBps();
  });

  readonly formattedReal = computed(() => this.formatDuration(this.secondsReal()));
  readonly formattedIdeal = computed(() => this.formatDuration(this.secondsIdeal()));

  readonly throughput = computed(() => {
    const eff = this.effectiveBps();
    if (eff <= 0) return 0;
    return eff / 1e6;
  });

  readonly oneDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );

  readonly sizeUnits: SizeUnit[] = ['MB', 'GB', 'TB'];
  readonly speedUnits: SpeedUnit[] = ['Mbps', 'Gbps'];

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

  setSize(v: number) { this.size.set(this.clampNum(v, 0.001, 1000000)); }
  setSizeUnit(u: SizeUnit) { this.sizeUnit.set(u); }
  setSpeed(v: number) { this.speed.set(this.clampNum(v, 0.01, 1000000)); }
  setSpeedUnit(u: SpeedUnit) { this.speedUnit.set(u); }
  setOverhead(v: number) { this.overhead.set(this.clampNum(v, 0, 90)); }

  private formatDuration(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
    const s = Math.round(totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h} ${this.t('labels.hoursShort')}`);
    if (m > 0) parts.push(`${m} ${this.t('labels.minutesShort')}`);
    if (sec > 0 || parts.length === 0) parts.push(`${sec} ${this.t('labels.secondsShort')}`);
    return parts.join(' ');
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
    return Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
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
