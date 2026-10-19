import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgStyle } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type PatternId = 'dots' | 'grid' | 'diagonal' | 'horizontal' | 'checkerboard' | 'cross' | 'zigzag' | 'waves';

const PATTERNS: PatternId[] = ['dots', 'grid', 'diagonal', 'horizontal', 'checkerboard', 'cross', 'zigzag', 'waves'];

interface PatternCss {
  image: string;
  size: string;
  position?: string;
}

function buildPattern(id: PatternId, fg: string, s: number): PatternCss {
  const q = s / 4;
  switch (id) {
    case 'dots':
      return { image: `radial-gradient(circle, ${fg} ${q}px, transparent ${q + 1}px)`, size: `${s}px ${s}px` };
    case 'grid':
      return {
        image: `linear-gradient(${fg} 1px, transparent 1px), linear-gradient(90deg, ${fg} 1px, transparent 1px)`,
        size: `${s}px ${s}px`,
      };
    case 'diagonal':
      return {
        image: `repeating-linear-gradient(45deg, ${fg} 0, ${fg} ${s / 2}px, transparent ${s / 2}px, transparent ${s}px)`,
        size: 'auto',
      };
    case 'horizontal':
      return {
        image: `repeating-linear-gradient(0deg, ${fg} 0 ${q}px, transparent ${q}px ${s / 2}px)`,
        size: 'auto',
      };
    case 'checkerboard':
      return {
        image: `conic-gradient(${fg} 25%, transparent 0 50%, ${fg} 0 75%, transparent 0)`,
        size: `${s}px ${s}px`,
      };
    case 'cross': {
      const w = Math.max(1, Math.round(s / 12));
      const half = s / 2;
      return {
        image:
          `linear-gradient(to right, transparent ${half - w}px, ${fg} ${half - w}px, ${fg} ${half + w}px, transparent ${half + w}px), ` +
          `linear-gradient(to bottom, transparent ${half - w}px, ${fg} ${half - w}px, ${fg} ${half + w}px, transparent ${half + w}px)`,
        size: `${s}px ${s}px`,
      };
    }
    case 'zigzag':
      return {
        image:
          `linear-gradient(135deg, ${fg} 25%, transparent 25%), linear-gradient(225deg, ${fg} 25%, transparent 25%), ` +
          `linear-gradient(45deg, ${fg} 25%, transparent 25%), linear-gradient(315deg, ${fg} 25%, transparent 25%)`,
        position: `${s / 2}px 0, ${s / 2}px 0, 0 0, 0 0`,
        size: `${s}px ${s}px`,
      };
    case 'waves':
      return {
        image:
          `radial-gradient(circle at 100% 50%, transparent 20%, ${fg} 21%, ${fg} 34%, transparent 35%), ` +
          `radial-gradient(circle at 0% 50%, transparent 20%, ${fg} 21%, ${fg} 34%, transparent 35%)`,
        size: `${s}px ${s}px`,
      };
  }
}

@Component({
  selector: 'app-css-background-pattern-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-background-pattern-generator.component.html',
  styleUrl: './css-background-pattern-generator.component.scss',
})
export class CssBackgroundPatternGeneratorComponent implements OnDestroy {
  readonly slug = 'css-background-pattern-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-border-radius-generator', 'css-box-shadow-generator', 'css-glassmorphism-generator', 'css-clip-path-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pattern = signal<PatternId>('dots');
  readonly bgColor = signal('#ffffff');
  readonly fgColor = signal('#4f46e5');
  readonly size = signal(24);
  readonly copied = signal(false);

  readonly patterns = PATTERNS;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly patternCss = computed((): PatternCss => buildPattern(this.pattern(), this.fgColor(), this.size()));

  readonly cssCode = computed(() => {
    const p = this.patternCss();
    const pos = p.position ? `\n  background-position: ${p.position};` : '';
    return `.my-pattern {\n  background-color: ${this.bgColor()};\n  background-image: ${p.image};\n  background-size: ${p.size};${pos}\n}`;
  });

  readonly previewStyle = computed(() => {
    const p = this.patternCss();
    const style: Record<string, string> = {
      'background-color': this.bgColor(),
      'background-image': p.image,
      'background-size': p.size,
    };
    if (p.position) style['background-position'] = p.position;
    return style;
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
  patternName(id: PatternId): string {
    return this.t('patterns.' + id);
  }
  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setPattern(p: PatternId) {
    this.pattern.set(p);
    this.copied.set(false);
  }
  setSize(v: number) {
    this.size.set(this.clampNum(v, 8, 96));
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
    const blob = new Blob([this.cssCode()], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'background-pattern.css';
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
