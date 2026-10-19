import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Status = 'good' | 'warn' | 'bad';

@Component({
  selector: 'app-serp-preview-tool',
  standalone: true,
  imports: [FormsModule, RouterLink, MicroRatingComponent],
  templateUrl: './serp-preview-tool.component.html',
  styleUrl: './serp-preview-tool.component.scss',
})
export class SerpPreviewToolComponent implements OnDestroy {
  readonly slug = 'serp-preview-tool';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['citation-generator', 'line-counter', 'lorem-ipsum-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly title = signal('');
  readonly description = signal('');
  readonly keyword = signal('');

  readonly titlePxLimit = 600;
  readonly descPxLimitDesktop = 1050;
  readonly titlePxLimitMobile = 680;
  readonly descPxLimitMobile = 640;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly titleChars = computed(() => this.title().length);
  readonly descChars = computed(() => this.description().length);

  /** Per-character pixel estimate (Arial-like, Google title size) — better than chars×8. */
  readonly titlePx = computed(() => this.pxWidth(this.title()));
  readonly descPx = computed(() => Math.round(this.pxWidth(this.description()) * 0.82));

  readonly titleStatus = computed((): Status => {
    const px = this.titlePx();
    if (px <= this.titlePxLimit) return 'good';
    if (px <= this.titlePxLimit + 80) return 'warn';
    return 'bad';
  });

  readonly descStatus = computed((): Status => {
    const px = this.descPx();
    if (px <= this.descPxLimitDesktop) return 'good';
    if (px <= this.descPxLimitDesktop + 150) return 'warn';
    return 'bad';
  });

  /** Truncated + keyword-highlighted segments for each preview surface. */
  readonly desktopTitle = computed(() =>
    this.segments(this.truncateToPx(this.title(), this.titlePxLimit)),
  );
  readonly desktopDesc = computed(() =>
    this.segments(this.truncateToPx(this.description(), this.descPxLimitDesktop)),
  );
  readonly mobileTitle = computed(() =>
    this.segments(this.truncateToPx(this.title(), this.titlePxLimitMobile)),
  );
  readonly mobileDesc = computed(() =>
    this.segments(this.truncateToPx(this.description(), this.descPxLimitMobile)),
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

  setTitle(v: string) {
    this.title.set(v);
  }
  setDescription(v: string) {
    this.description.set(v);
  }
  setKeyword(v: string) {
    this.keyword.set(v);
  }
  clear() {
    this.title.set('');
    this.description.set('');
    this.keyword.set('');
  }

  private charWidth(ch: string): number {
    if (ch === ' ' || ch === 'i' || ch === 'l' || ch === 't' || ch === '.' || ch === ',') return 4;
    if (ch === 'W' || ch === 'M') return 12;
    if (ch === 'm' || ch === 'w') return 10;
    if (ch >= 'A' && ch <= 'Z') return 9;
    if (ch >= 'a' && ch <= 'z') return 8;
    if (ch >= '0' && ch <= '9') return 8;
    return 9;
  }

  private pxWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += this.charWidth(ch);
    return w;
  }

  private truncateToPx(s: string, limit: number): string {
    let w = 0;
    let i = 0;
    for (const ch of s) {
      w += this.charWidth(ch);
      if (w > limit) break;
      i += ch.length;
    }
    return i < s.length ? s.slice(0, i).trimEnd() + '…' : s;
  }

  private segments(text: string): Array<{ t: string; b: boolean }> {
    if (!text) return [];
    const kw = this.keyword().trim();
    if (!kw) return [{ t: text, b: false }];
    const out: Array<{ t: string; b: boolean }> = [];
    const lower = text.toLowerCase();
    const kl = kw.toLowerCase();
    let i = 0;
    while (i < text.length) {
      const j = lower.indexOf(kl, i);
      if (j === -1) {
        out.push({ t: text.slice(i), b: false });
        break;
      }
      if (j > i) out.push({ t: text.slice(i, j), b: false });
      out.push({ t: text.slice(j, j + kw.length), b: true });
      i = j + kw.length;
    }
    return out;
  }

  statusLabel(s: Status): string {
    return s === 'good' ? this.t('labels.statusGood') : s === 'warn' ? this.t('labels.statusWarn') : this.t('labels.statusBad');
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
