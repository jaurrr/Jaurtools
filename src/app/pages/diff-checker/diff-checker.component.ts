import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-diff-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './diff-checker.component.html',
  styleUrl: './diff-checker.component.scss',
})
export class DiffCheckerComponent implements OnDestroy {
  readonly slug = 'diff-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['rich-text-html-editor', 'sig-figs-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly textA = signal('The quick brown fox\njumps over\nthe lazy dog\nand runs away');
  readonly textB = signal('The quick brown fox\nleaps over\nthe lazy dog\nand walks away\nThe end');


  readonly mode = signal<'line' | 'word'>('line');
  setMode(m: 'line' | 'word') { this.mode.set(m); }

  private lcsDiff<T>(a: T[], b: T[]): Array<{ a: T | null; b: T | null; kind: 'same' | 'del' | 'add' }> {
    const n = a.length, m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const rows: Array<{ a: T | null; b: T | null; kind: 'same' | 'del' | 'add' }> = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { rows.push({ a: a[i], b: b[j], kind: 'same' }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ a: a[i], b: null, kind: 'del' }); i++; }
      else { rows.push({ a: null, b: b[j], kind: 'add' }); j++; }
    }
    while (i < n) { rows.push({ a: a[i], b: null, kind: 'del' }); i++; }
    while (j < m) { rows.push({ a: null, b: b[j], kind: 'add' }); j++; }
    return rows;
  }

  readonly rows = computed((): Array<{ a: string | null; b: string | null; kind: 'same' | 'del' | 'add' }> => {
    const a = this.textA().split('\n');
    const b = this.textB().split('\n');
    if (a.length > 500 || b.length > 500) return [];
    return this.lcsDiff(a, b);
  });

  private splitWords(s: string): string[] {
    return s.split(/(\s+)/).filter((t) => t.length > 0);
  }

  readonly wordRows = computed(() => {
    const a = this.splitWords(this.textA());
    const b = this.splitWords(this.textB());
    if (a.length > 4000 || b.length > 4000) return [];
    return this.lcsDiff(a, b);
  });

  readonly tooLarge = computed(
    () => this.textA().split('\n').length > 500 || this.textB().split('\n').length > 500
  );
  readonly addedCount = computed(() => this.rows().filter((r) => r.kind === 'add').length);
  readonly removedCount = computed(() => this.rows().filter((r) => r.kind === 'del').length);
  readonly sameCount = computed(() => this.rows().filter((r) => r.kind === 'same').length);

  setTextA(v: string) { this.textA.set(v); }
  setTextB(v: string) { this.textB.set(v); }
  swap() {
    const a = this.textA();
    this.textA.set(this.textB());
    this.textB.set(a);
  }
  clear() { this.textA.set(''); this.textB.set(''); }
  loadSample() { this.textA.set('The quick brown fox\njumps over\nthe lazy dog\nand runs away'); this.textB.set('The quick brown fox\nleaps over\nthe lazy dog\nand walks away\nThe end'); }


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
