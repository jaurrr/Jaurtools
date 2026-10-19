import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'are', 'was', 'were',
  'be', 'been', 'for', 'with', 'as', 'at', 'by', 'from', 'it', 'its', 'this', 'that',
  'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'his', 'our', 'their', 'not', 'no', 'so', 'but', 'if',
  'then', 'than', 'when', 'where', 'which', 'who', 'what', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'do', 'does',
  'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'may',
  'might', 'must',
]);

interface WordStat {
  word: string;
  count: number;
  density: number;
}

@Component({
  selector: 'app-keyword-density-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './keyword-density-checker.component.html',
  styleUrl: './keyword-density-checker.component.scss',
})
export class KeywordDensityCheckerComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.twoDecimals().format(this.density()) + "%");
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

  readonly slug = 'keyword-density-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['business-card-maker', 'online-notepad', 'speed-reader'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('The cat sat on the mat. The cat slept.');
  readonly keyword = signal('cat');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private readonly words = computed(() =>
    this.text()
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );

  readonly totalWords = computed(() => this.words().length);

  readonly totalChars = computed(() => this.text().replace(/\s/g, '').length);

  readonly sentences = computed(() =>
    this.text().split(/[.!?]+/).filter((s) => s.trim().length > 0).length
  );

  readonly keywordCount = computed(() => {
    const kw = this.keyword().trim().toLowerCase();
    if (!kw) return 0;
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    return (this.text().toLowerCase().match(re) || []).length;
  });

  readonly density = computed(() => {
    const total = this.totalWords();
    if (total === 0) return 0;
    return (this.keywordCount() / total) * 100;
  });

  readonly topWords = computed<WordStat[]>(() => {
    const counts = new Map<string, number>();
    for (const w of this.words()) {
      if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
    }
    const total = this.totalWords();
    return [...counts.entries()]
      .map(([word, count]) => ({ word, count, density: total ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  });

  readonly topPhrases = computed<WordStat[]>(() => {
    const ws = this.words();
    const counts = new Map<string, number>();
    for (let i = 0; i < ws.length - 1; i++) {
      if (STOPWORDS.has(ws[i]) && STOPWORDS.has(ws[i + 1])) continue;
      const p = ws[i] + ' ' + ws[i + 1];
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    const total = Math.max(1, ws.length - 1);
    return [...counts.entries()]
      .map(([word, count]) => ({ word, count, density: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  readonly twoDecimals = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  setText(v: string): void {
    this.text.set(v.slice(0, 50000));
  }
  setKeyword(v: string): void {
    this.keyword.set(v.slice(0, 60));
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

  ngOnDestroy(): void {
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

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
