import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-generate-list-of-numbers',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './generate-list-of-numbers.component.html',
  styleUrl: './generate-list-of-numbers.component.scss',
})
export class GenerateListOfNumbersComponent implements OnDestroy {
  readonly slug = 'generate-list-of-numbers';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['filter-numbers', 'min-max-of-a-list', 'number-sequence-calculator', 'number-base-converter'];
  readonly maxItems = 5000;

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly start = signal(1);
  readonly end = signal(20);
  readonly step = signal(2);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly list = computed(() => {
    const s = this.start(), e = this.end(), st = this.step();
    if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(st) || st === 0) return [];
    const out: number[] = [];
    if (st > 0) {
      for (let v = s; v <= e && out.length < this.maxItems; v += st) out.push(this.round(v));
    } else {
      for (let v = s; v >= e && out.length < this.maxItems; v += st) out.push(this.round(v));
    }
    return out;
  });

  readonly truncated = computed(() => {
    const s = this.start(), e = this.end(), st = this.step();
    if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(st) || st === 0) return false;
    const count = st > 0 ? Math.floor((e - s) / st) + 1 : Math.floor((s - e) / Math.abs(st)) + 1;
    return count > this.maxItems;
  });

  readonly numFormat = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 6 })
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

  list2(key: string): string[] {
    this.translate.lang();
    const raw = this.lookup(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setStart(v: number) { this.start.set(this.clampNum(v, -1000000, 1000000)); }
  setEnd(v: number) { this.end.set(this.clampNum(v, -1000000, 1000000)); }
  setStep(v: number) { this.step.set(this.clampNum(v, -1000000, 1000000)); }

  copyResult() {
    const text = this.list().join(', ');
    try {
      void navigator.clipboard?.writeText(text);
    } catch { /* clipboard unavailable */ }
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  downloadResult() {
    const blob = new Blob([this.list().join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'number-list.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private round(v: number): number {
    return Math.round(v * 1000000) / 1000000;
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
    return Math.min(max, Math.max(min, v));
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
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
