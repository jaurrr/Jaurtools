import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-pace-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pace-calculator.component.html',
  styleUrl: './pace-calculator.component.scss',
})
export class PaceCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.fmtPace(this.paceResult()!.secPerKm) + "/km");
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

  readonly slug = 'pace-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['steps-to-miles-calculator', 'target-heart-rate-calculator', 'bmi-calculator', 'sleep-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'pace' | 'time'>('pace');
  readonly distKm = signal(10);
  readonly hours = signal(0);
  readonly mins = signal(55);
  readonly secs = signal(0);
  readonly paceMin = signal(5);
  readonly paceSec = signal(30);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly totalSeconds = computed(
    () => this.hours() * 3600 + this.mins() * 60 + this.secs()
  );

  readonly paceResult = computed(() => {
    const d = this.distKm();
    const t = this.totalSeconds();
    if (d <= 0 || t <= 0) return null;
    const secPerKm = t / d;
    const kmh = 3600 / secPerKm;
    return {
      secPerKm,
      secPerMile: secPerKm * 1.60934,
      kmh,
      mph: kmh * 0.621371,
    };
  });

  readonly timeResult = computed(() => {
    const d = this.distKm();
    if (d <= 0) return null;
    const total = (this.paceMin() * 60 + this.paceSec()) * d;
    return {
      h: Math.floor(total / 3600),
      m: Math.floor((total % 3600) / 60),
      s: Math.round(total % 60),
    };
  });

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

  fmtPace(sec: number): string {
    const total = Math.round(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  fmtHMS(h: number, m: number, s: number): string {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  fmtSpeed(v: number): string {
    return new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  }

  setMode(v: 'pace' | 'time') { this.mode.set(v); }
  setDistKm(v: number) { this.distKm.set(this.clampNum(v, 0.1, 500)); }
  setHours(v: number) { this.hours.set(this.clampNum(v, 0, 24)); }
  setMins(v: number) { this.mins.set(this.clampNum(v, 0, 59)); }
  setSecs(v: number) { this.secs.set(this.clampNum(v, 0, 59)); }
  setPaceMin(v: number) { this.paceMin.set(this.clampNum(v, 1, 30)); }
  setPaceSec(v: number) { this.paceSec.set(this.clampNum(v, 0, 59)); }

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
