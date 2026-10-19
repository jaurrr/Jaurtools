import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgStyle } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Direction = 'up' | 'down' | 'left' | 'right';

@Component({
  selector: 'app-css-triangle-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-triangle-generator.component.html',
  styleUrl: './css-triangle-generator.component.scss',
})
export class CssTriangleGeneratorComponent implements OnDestroy {
  readonly slug = 'css-triangle-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['unit-converter', 'word-counter', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly directions: Direction[] = ['up', 'down', 'left', 'right'];
  readonly direction = signal<Direction>('up');
  readonly width = signal(100);
  readonly height = signal(60);
  readonly color = signal('#4f46e5');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private halfW(): string {
    const w = this.width();
    return w % 2 === 0 ? String(w / 2) : (w / 2).toFixed(1);
  }
  private halfH(): string {
    const h = this.height();
    return h % 2 === 0 ? String(h / 2) : (h / 2).toFixed(1);
  }

  readonly css = computed(() => {
    const d = this.direction();
    const w = this.width();
    const h = this.height();
    const c = this.color();
    let borders: string;
    if (d === 'up') {
      borders = `  border-left: ${this.halfW()}px solid transparent;\n  border-right: ${this.halfW()}px solid transparent;\n  border-bottom: ${h}px solid ${c};`;
    } else if (d === 'down') {
      borders = `  border-left: ${this.halfW()}px solid transparent;\n  border-right: ${this.halfW()}px solid transparent;\n  border-top: ${h}px solid ${c};`;
    } else if (d === 'left') {
      borders = `  border-top: ${this.halfH()}px solid transparent;\n  border-bottom: ${this.halfH()}px solid transparent;\n  border-right: ${w}px solid ${c};`;
    } else {
      borders = `  border-top: ${this.halfH()}px solid transparent;\n  border-bottom: ${this.halfH()}px solid transparent;\n  border-left: ${w}px solid ${c};`;
    }
    return `.triangle {\n  width: 0;\n  height: 0;\n${borders}\n}`;
  });

  readonly previewStyle = computed((): Record<string, string> => {
    const d = this.direction();
    const w = this.width();
    const h = this.height();
    const c = this.color();
    const base: Record<string, string> = { width: '0', height: '0' };
    if (d === 'up') {
      base['border-left'] = `${this.halfW()}px solid transparent`;
      base['border-right'] = `${this.halfW()}px solid transparent`;
      base['border-bottom'] = `${h}px solid ${c}`;
    } else if (d === 'down') {
      base['border-left'] = `${this.halfW()}px solid transparent`;
      base['border-right'] = `${this.halfW()}px solid transparent`;
      base['border-top'] = `${h}px solid ${c}`;
    } else if (d === 'left') {
      base['border-top'] = `${this.halfH()}px solid transparent`;
      base['border-bottom'] = `${this.halfH()}px solid transparent`;
      base['border-right'] = `${w}px solid ${c}`;
    } else {
      base['border-top'] = `${this.halfH()}px solid transparent`;
      base['border-bottom'] = `${this.halfH()}px solid transparent`;
      base['border-left'] = `${w}px solid ${c}`;
    }
    return base;
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

  setDirection(d: Direction) { this.direction.set(d); }
  setWidth(v: number) { this.width.set(this.clampNum(v, 4, 400)); }
  setHeight(v: number) { this.height.set(this.clampNum(v, 4, 400)); }
  setColor(v: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) this.color.set(v.toLowerCase());
  }

  copy() {
    const text = this.css();
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private fallbackCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
      done();
    } catch {
      ta.remove();
    }
    ta.remove();
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
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
