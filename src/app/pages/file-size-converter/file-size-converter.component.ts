import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-file-size-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './file-size-converter.component.html',
  styleUrl: './file-size-converter.component.scss',
})
export class FileSizeConverterComponent implements OnDestroy {
  readonly slug = 'file-size-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['byte-size-calculator', 'data-storage-converter', 'ascii-table'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'dec' | 'bin'>('dec');
  readonly value = signal(2.5);
  readonly from = signal('GB');
  readonly to = signal('MB');
  readonly units = ['B', 'KB', 'MB', 'GB', 'TB'];
  private readonly factors = computed<Record<string, number>>(() => {
    const k = this.mode() === 'dec' ? 1000 : 1024;
    return { B: 1, KB: k, MB: k * k, GB: k * k * k, TB: k * k * k * k };
  });
  readonly result = computed(() => {
    const f = this.factors();
    const a = f[this.from()] ?? 1;
    const b = f[this.to()] ?? 1;
    if (!Number.isFinite(this.value()) || b === 0) return 0;
    return (this.value() * a) / b;
  });
  readonly fmt = computed(() =>
    new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 4 })
  );
  setMode(m: 'dec' | 'bin') { this.mode.set(m); }
  setValue(v: number) { this.value.set(Number.isFinite(v) ? v : 0); }
  setFrom(u: string) { this.from.set(u); }
  setTo(u: string) { this.to.set(u); }
  swap() { const f = this.from(); this.from.set(this.to()); this.to.set(f); }

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
