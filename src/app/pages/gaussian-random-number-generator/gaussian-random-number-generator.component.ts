import { Component, computed, effect, inject, OnDestroy, signal, HostListener} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const BINS = 20;

@Component({
  selector: 'app-gaussian-random-number-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './gaussian-random-number-generator.component.html',
  styleUrl: './gaussian-random-number-generator.component.scss',
})
export class GaussianRandomNumberGeneratorComponent implements OnDestroy {
  readonly slug = 'gaussian-random-number-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['dice-roller', 'list-randomizer', 'coin-flip'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mean = signal(100);
  readonly stdDev = signal(15);
  readonly count = signal(1000);
  readonly values = signal<number[]>([]);
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private gaussianUnit(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  generate(): void {
    const n = this.count();
    const mu = this.mean();
    const sd = this.stdDev();
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = mu + sd * this.gaussianUnit();
    this.values.set(out);
  }

  readonly stats = computed(() => {
    const vs = this.values();
    if (vs.length === 0) return null;
    let sum = 0;
    let min = vs[0];
    let max = vs[0];
    for (const v of vs) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const m = sum / vs.length;
    let sq = 0;
    for (const v of vs) sq += (v - m) * (v - m);
    return { mean: m, std: Math.sqrt(sq / vs.length), min, max, n: vs.length };
  });

  readonly histogram = computed(() => {
    const s = this.stats();
    if (!s || s.max === s.min) return [];
    const counts = new Array<number>(BINS).fill(0);
    const span = s.max - s.min;
    for (const v of this.values()) {
      const b = Math.min(BINS - 1, Math.floor(((v - s.min) / span) * BINS));
      counts[b]++;
    }
    const peak = Math.max(...counts);
    return counts.map((c) => (peak === 0 ? 0 : Math.round((c / peak) * 100)));
  });

  readonly preview = computed(() => this.values().slice(0, 20));

  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

  setMean(v: number): void {
    this.mean.set(this.clampNum(v, -1000000, 1000000));
  }

  setStdDev(v: number): void {
    this.stdDev.set(this.clampNum(v, 0.01, 1000000));
  }

  setCount(v: number): void {
    this.count.set(Math.min(10000, Math.max(1, Math.round(v) || 1)));
  }

  downloadCsv(): void {
    const csv = 'index,value\n' + this.values().map((v, i) => `${i + 1},${v}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'gaussian-random-numbers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  copyValues(): void {
    const text = this.values().join('\n');
    if (!text) return;
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void): void {
    try {
      const ta = this.document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.document.body.appendChild(ta);
      ta.select();
      this.document.execCommand('copy');
      ta.remove();
      done();
    } catch {
      // clipboard unavailable in this browser
    }
  }


  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'r') this.generate();
    else if (key === 'c') this.copyValues();
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
