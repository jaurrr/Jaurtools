import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, NgStyle } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ShapeDef {
  id: string;
  clip: string;
}

const SHAPES: ShapeDef[] = [
  { id: 'triangle', clip: 'polygon(50% 0%, 0% 100%, 100% 100%)' },
  { id: 'rightTriangle', clip: 'polygon(0% 0%, 0% 100%, 100% 100%)' },
  { id: 'diamond', clip: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  { id: 'pentagon', clip: 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)' },
  { id: 'hexagon', clip: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' },
  { id: 'octagon', clip: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' },
  { id: 'parallelogram', clip: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)' },
  { id: 'arrow', clip: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)' },
  { id: 'star', clip: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' },
  { id: 'speechBubble', clip: 'polygon(0% 0%, 100% 0%, 100% 75%, 75% 75%, 75% 100%, 50% 75%, 0% 75%)' },
  { id: 'circle', clip: 'circle(50% at 50% 50%)' },
  { id: 'ellipse', clip: 'ellipse(50% 35% at 50% 50%)' },
];

@Component({
  selector: 'app-css-clip-path-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, NgStyle],
  templateUrl: './css-clip-path-generator.component.html',
  styleUrl: './css-clip-path-generator.component.scss',
})
export class CssClipPathGeneratorComponent implements OnDestroy {
  readonly slug = 'css-clip-path-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-border-radius-generator', 'css-background-pattern-generator', 'css-box-shadow-generator', 'css-glassmorphism-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly shapeId = signal('hexagon');
  readonly fillColor = signal('#4f46e5');
  readonly demoSize = signal(200);
  readonly copied = signal(false);

  readonly shapes = SHAPES;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly activeShape = computed(() => this.shapes.find((s) => s.id === this.shapeId()) ?? this.shapes[0]);

  readonly cssCode = computed(() => `clip-path: ${this.activeShape().clip};`);

  readonly previewStyle = computed(() => ({
    'clip-path': this.activeShape().clip,
    'background-color': this.fillColor(),
    width: `${this.demoSize()}px`,
    height: `${this.demoSize()}px`,
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
  shapeName(id: string): string {
    return this.t('shapes.' + id);
  }
  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setShape(id: string) {
    this.shapeId.set(id);
    this.copied.set(false);
  }
  setDemoSize(v: number) {
    this.demoSize.set(this.clampNum(v, 120, 320));
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
    const blob = new Blob([`.clipped {\n  ${this.cssCode()}\n}`], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'clip-path.css';
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
