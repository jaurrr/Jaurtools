import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-gas-mileage-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './gas-mileage-calculator.component.html',
  styleUrl: './gas-mileage-calculator.component.scss',
})
export class GasMileageCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.sys() === 'metric' ? this.avgKml() + ' ' + this.t('labels.kmPerL') : this.avgMpg() + ' ' + this.t('labels.mpg'));
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

  readonly slug = 'gas-mileage-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['square-footage-calculator', 'unit-converter', 'percentage-calculator', 'time-card-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sys = signal<'metric' | 'imperial'>('metric');
  readonly dist = signal('');
  readonly fuel = signal('');
  readonly entries = signal<{ km: number; l: number }[]>([]);

  setSys(s: 'metric' | 'imperial') { this.sys.set(s); }
  setDist(v: string) { this.dist.set(v); }
  setFuel(v: string) { this.fuel.set(v); }

  addEntry() {
    const d = parseFloat(this.dist());
    const f = parseFloat(this.fuel());
    if (!Number.isFinite(d) || !Number.isFinite(f) || d <= 0 || f <= 0) return;
    const km = this.sys() === 'metric' ? d : d * 1.609344;
    const l = this.sys() === 'metric' ? f : f * 3.785411784;
    this.entries.update((e) => [...e, { km, l }]);
    this.dist.set('');
    this.fuel.set('');
  }
  removeEntry(i: number) {
    this.entries.update((e) => e.filter((_, x) => x !== i));
  }
  readonly totals = computed(() => {
    const e = this.entries();
    const km = e.reduce((x, r) => x + r.km, 0);
    const l = e.reduce((x, r) => x + r.l, 0);
    if (!e.length || l <= 0) return null;
    const kml = km / l;
    return { kml, l100: 100 / kml, mpg: kml * 2.3521458, km, l, count: e.length };
  });
  private fmt(v: number, frac: number): string {
    return new Intl.NumberFormat(this.locale(), { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(v);
  }
  readonly avgKml = computed(() => {
    const t = this.totals();
    return t ? this.fmt(t.kml, 2) : '';
  });
  readonly avgL100 = computed(() => {
    const t = this.totals();
    return t ? this.fmt(t.l100, 2) : '';
  });
  readonly avgMpg = computed(() => {
    const t = this.totals();
    return t ? this.fmt(t.mpg, 1) : '';
  });
  readonly totalDistText = computed(() => {
    const t = this.totals();
    if (!t) return '';
    const v = this.sys() === 'metric' ? t.km : t.km / 1.609344;
    return this.fmt(v, 1);
  });
  readonly totalFuelText = computed(() => {
    const t = this.totals();
    if (!t) return '';
    const v = this.sys() === 'metric' ? t.l : t.l / 3.785411784;
    return this.fmt(v, 2);
  });
  entryLine(r: { km: number; l: number }): string {
    const kml = r.km / r.l;
    if (this.sys() === 'metric') {
      return `${this.fmt(r.km, 1)} ${this.t('labels.kmUnit')} / ${this.fmt(r.l, 2)} ${this.t('labels.lUnit')} = ${this.fmt(kml, 2)} ${this.t('labels.kmPerL')}`;
    }
    const mi = r.km / 1.609344;
    const gal = r.l / 3.785411784;
    return `${this.fmt(mi, 1)} ${this.t('labels.miUnit')} / ${this.fmt(gal, 2)} ${this.t('labels.galUnit')} = ${this.fmt(kml * 2.3521458, 1)} ${this.t('labels.mpg')}`;
  }
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
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
  private parseLocalDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  private fmtDate(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'full' }).format(d);
  }
  private fmtWeekday(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long' }).format(d);
  }
  private isoDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
