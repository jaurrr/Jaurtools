import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-random-number-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './random-number-generator.component.html',
  styleUrl: './random-number-generator.component.scss',
})
export class RandomNumberGeneratorComponent implements OnDestroy {
  readonly slug = 'random-number-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = [
    'probability-calculator',
    'permutation-and-combination-calculator',
    'prime-factorization-calculator',
    'root-calculator',
  ];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly min = signal(1);
  readonly max = signal(100);
  readonly count = signal(5);
  readonly unique = signal(true);
  readonly seed = signal(0);
  readonly copied = signal(false);
  readonly drawing = signal(false);
  readonly preview = signal<number[]>([]);
  private drawId: ReturnType<typeof setInterval> | null = null;
  readonly shown = computed(() => (this.drawing() ? this.preview() : this.numbers()));

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly valid = computed(() => {
    const lo = this.min();
    const hi = this.max();
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) return false;
    const c = Math.floor(this.count());
    if (c < 1 || c > 100) return false;
    if (this.unique() && c > hi - lo + 1) return false;
    return true;
  });

  private randInt(lo: number, hi: number): number {
    const range = hi - lo + 1;
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / range) * range;
    let x = 0;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return lo + (x % range);
  }

  readonly numbers = computed((): number[] => {
    this.seed();
    if (!this.valid()) return [];
    const lo = this.min();
    const hi = this.max();
    const c = Math.floor(this.count());
    const out: number[] = [];
    const seen = new Set<number>();
    let guard = 0;
    while (out.length < c && guard < c * 50 + 1000) {
      guard++;
      const v = this.randInt(lo, hi);
      if (this.unique()) {
        if (seen.has(v)) continue;
        seen.add(v);
      }
      out.push(v);
    }
    return out;
  });

  readonly stats = computed(() => {
    const ns = this.numbers();
    if (ns.length === 0) return null;
    const sum = ns.reduce((s, v) => s + v, 0);
    const sorted = [...ns].sort((x, y) => x - y);
    return {
      sum,
      avg: sum / ns.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  });

  readonly fmtInt = computed(() => new Intl.NumberFormat(this.locale()));
  readonly fmt1 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
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

  setMin(v: number) {
    this.min.set(Math.floor(this.clampNum(v, -1000000000, 1000000000)));
  }

  setMax(v: number) {
    this.max.set(Math.floor(this.clampNum(v, -1000000000, 1000000000)));
  }

  setCount(v: number) {
    this.count.set(Math.floor(this.clampNum(v, 1, 100)));
  }

  toggleUnique() {
    this.unique.update((u) => !u);
  }

  regenerate() {
    if (this.drawing()) return;
    if (!this.valid()) {
      this.seed.update((s) => s + 1);
      return;
    }
    this.drawing.set(true);
    const lo = this.min(), hi = this.max(), c = this.count();
    const roll = () => lo + Math.floor(Math.random() * (hi - lo + 1));
    this.preview.set(Array.from({ length: c }, roll));
    this.drawId = setInterval(() => {
      this.preview.set(Array.from({ length: c }, roll));
    }, 60);
    setTimeout(() => {
      if (this.drawId !== null) { clearInterval(this.drawId); this.drawId = null; }
      this.drawing.set(false);
      this.seed.update((s) => s + 1);
    }, 650);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.regenerate();
    }
  }

  async copyAll() {
    const text = this.numbers().join(', ');
    try {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
    if (this.drawId !== null) clearInterval(this.drawId);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
