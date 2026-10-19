import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-golf-handicap-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './golf-handicap-calculator.component.html',
  styleUrl: './golf-handicap-calculator.component.scss',
})
export class GolfHandicapCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.handicapIndex());
  copyMain(): void {
    const text = String(this.copyText());
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

  readonly slug = 'golf-handicap-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['grade-calculator', 'gpa-calculator', 'percentage-calculator', 'average-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly scoresText = signal('92, 88, 95, 90, 87');
  readonly rating = signal(71.5);
  readonly slope = signal(128);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly parsedScores = computed(() => {
    const parts = this.scoresText().split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const nums: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (Number.isFinite(n)) nums.push(Math.round(n * 10) / 10);
    }
    return nums;
  });

  readonly tableEntry = computed((): [number, number] | null => {
    const n = this.parsedScores().length;
    const table: Record<number, [number, number]> = {
      3: [1, 2], 4: [1, 1], 5: [1, 0], 6: [2, 1], 7: [2, 0], 8: [2, 0],
      9: [3, 0], 10: [3, 0], 11: [4, 0], 12: [4, 0], 13: [5, 0], 14: [5, 0],
      15: [6, 0], 16: [6, 0], 17: [7, 0], 18: [8, 0], 19: [9, 0], 20: [8, 0],
    };
    return table[n] ?? null;
  });

  readonly valid = computed(() => {
    const scores = this.parsedScores();
    if (scores.length < 3 || scores.length > 20) return false;
    if (scores.some((s) => s < 40 || s > 150)) return false;
    if (this.rating() < 55 || this.rating() > 80) return false;
    if (this.slope() < 55 || this.slope() > 155) return false;
    return true;
  });

  readonly differentials = computed(() => {
    if (!this.valid()) return [];
    const r = this.rating(), s = this.slope();
    return this.parsedScores()
      .map((score) => Math.round(((score - r) * 113 / s) * 10) / 10)
      .sort((a, b) => a - b);
  });

  readonly handicapIndex = computed(() => {
    const diffs = this.differentials();
    const entry = this.tableEntry();
    if (!diffs.length || !entry) return 0;
    const [use, adj] = entry;
    const used = diffs.slice(0, use);
    const avg = used.reduce((a, b) => a + b, 0) / used.length;
    return Math.round((avg - adj) * 10) / 10;
  });

  readonly bestUsed = computed(() => {
    const entry = this.tableEntry();
    return entry ? entry[0] : 0;
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

  setScoresText(v: string) { this.scoresText.set(v); }
  setRating(v: number) { this.rating.set(this.clampNum(v, 55, 80)); }
  setSlope(v: number) { this.slope.set(this.clampNum(v, 55, 155)); }

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
