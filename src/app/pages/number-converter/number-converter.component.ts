import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';


@Component({
  selector: 'app-number-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './number-converter.component.html',
  styleUrl: './number-converter.component.scss',
})
export class NumberConverterComponent implements OnDestroy {
  readonly slug = 'number-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['number-to-words-converter', 'url-encoder-decoder', 'length-converter', 'weight-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly digits = signal('255');
  readonly fromBase = signal(10);
  readonly toBase = signal(16);

  readonly baseOptions = computed(() => {
    this.translate.lang();
    const raw = this.lookup('baseOptions');
    return Array.isArray(raw) ? (raw as { id: number; name: string }[]) : [];
  });

  readonly parsed = computed(() => {
    const s = this.digits().trim();
    const b = this.fromBase();
    if (!s) return null;
    const patterns: Record<number, RegExp> = {
      2: /^[01]+$/,
      8: /^[0-7]+$/,
      10: /^[0-9]+$/,
      16: /^[0-9a-fA-F]+$/,
    };
    if (!patterns[b].test(s)) return null;
    try {
      const prefix = b === 2 ? '0b' : b === 8 ? '0o' : b === 16 ? '0x' : '';
      return BigInt(prefix + s);
    } catch {
      return null;
    }
  });

  readonly converted = computed(() => {
    const p = this.parsed();
    if (p === null) return '';
    const b = this.toBase();
    return b === 2 ? p.toString(2) : b === 8 ? p.toString(8) : b === 16 ? p.toString(16).toUpperCase() : p.toString(10);
  });

  readonly allBases = computed(() => {
    const p = this.parsed();
    if (p === null) return [];
    return [
      { id: 2, value: p.toString(2) },
      { id: 8, value: p.toString(8) },
      { id: 10, value: p.toString(10) },
      { id: 16, value: p.toString(16).toUpperCase() },
    ];
  });

  baseName(id: number): string {
    return this.baseOptions().find((o) => o.id === id)?.name ?? String(id);
  }

  readonly copiedBase = signal<number | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  copyBase(id: number, value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.copiedBase.set(id);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedBase.set(null), 1600);
    }).catch(() => undefined);
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
    return Math.min(max, Math.max(min, Math.round(v * 10000) / 10000));
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
