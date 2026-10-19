import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgStyle } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-css-border-radius-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-border-radius-generator.component.html',
  styleUrl: './css-border-radius-generator.component.scss',
})
export class CssBorderRadiusGeneratorComponent implements OnDestroy {
  readonly slug = 'css-border-radius-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-box-shadow-generator', 'css-background-pattern-generator', 'css-clip-path-generator', 'css-glassmorphism-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly topLeft = signal(24);
  readonly topRight = signal(24);
  readonly bottomRight = signal(24);
  readonly bottomLeft = signal(24);
  readonly unit = signal<'px' | '%'>('px');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly maxVal = computed(() => (this.unit() === 'px' ? 150 : 50));

  readonly cssCode = computed(() => {
    const u = this.unit();
    const v = (n: number) => `${n}${u}`;
    return `border-radius: ${v(this.topLeft())} ${v(this.topRight())} ${v(this.bottomRight())} ${v(this.bottomLeft())};`;
  });

  readonly previewStyle = computed(() => ({
    'border-radius': `${this.topLeft()}${this.unit()} ${this.topRight()}${this.unit()} ${this.bottomRight()}${this.unit()} ${this.bottomLeft()}${this.unit()}`,
  }));

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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  setUnit(u: 'px' | '%') {
    this.unit.set(u);
    this.topLeft.set(Math.min(this.topLeft(), 150));
    this.topRight.set(Math.min(this.topRight(), 150));
    this.bottomRight.set(Math.min(this.bottomRight(), 150));
    this.bottomLeft.set(Math.min(this.bottomLeft(), 150));
    if (u === '%') {
      this.topLeft.set(Math.min(this.topLeft(), 50));
      this.topRight.set(Math.min(this.topRight(), 50));
      this.bottomRight.set(Math.min(this.bottomRight(), 50));
      this.bottomLeft.set(Math.min(this.bottomLeft(), 50));
    }
  }
  setCorner(which: 'tl' | 'tr' | 'br' | 'bl', v: number) {
    const n = this.clampNum(v, 0, this.maxVal());
    if (which === 'tl') this.topLeft.set(n);
    else if (which === 'tr') this.topRight.set(n);
    else if (which === 'br') this.bottomRight.set(n);
    else this.bottomLeft.set(n);
  }

  async copyCss() {
    try {
      await navigator.clipboard.writeText(this.cssCode()).catch(() => undefined);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  downloadCss() {
    const blob = new Blob([`.rounded {\n  ${this.cssCode()}\n}`], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'border-radius.css';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
