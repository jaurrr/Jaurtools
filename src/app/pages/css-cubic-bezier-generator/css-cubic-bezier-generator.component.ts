import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Preset {
  id: string;
  v: [number, number, number, number];
}

const PRESETS: Preset[] = [
  { id: 'linear', v: [0, 0, 1, 1] },
  { id: 'ease', v: [0.25, 0.1, 0.25, 1] },
  { id: 'easeIn', v: [0.42, 0, 1, 1] },
  { id: 'easeOut', v: [0, 0, 0.58, 1] },
  { id: 'easeInOut', v: [0.42, 0, 0.58, 1] },
];

const W = 200;
const PAD = 14;

function mapX(x: number): number {
  return PAD + x * (W - 2 * PAD);
}
function mapY(y: number): number {
  return W - PAD - y * (W - 2 * PAD);
}

@Component({
  selector: 'app-css-cubic-bezier-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-cubic-bezier-generator.component.html',
  styleUrl: './css-cubic-bezier-generator.component.scss',
})
export class CssCubicBezierGeneratorComponent implements OnDestroy {
  readonly slug = 'css-cubic-bezier-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-box-shadow-generator', 'css-border-radius-generator', 'css-glassmorphism-generator', 'css-clip-path-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly x1 = signal(0.25);
  readonly y1 = signal(0.1);
  readonly x2 = signal(0.25);
  readonly y2 = signal(1);
  readonly duration = signal(1200);
  readonly copied = signal(false);

  readonly presets = PRESETS;
  readonly demoDot = viewChild<ElementRef<HTMLDivElement>>('demoDot');

  private jsonLdEl: HTMLScriptElement | null = null;
  private currentAnim: Animation | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly bezier = computed(() => {
    const f = (n: number) => (Math.round(n * 100) / 100).toString();
    return `cubic-bezier(${f(this.x1())}, ${f(this.y1())}, ${f(this.x2())}, ${f(this.y2())})`;
  });

  readonly cssCode = computed(() => `transition-timing-function: ${this.bezier()};`);

  readonly curvePath = computed(() => {
    const p0x = mapX(0), p0y = mapY(0);
    const p3x = mapX(1), p3y = mapY(1);
    const p1x = mapX(this.x1()), p1y = mapY(this.y1());
    const p2x = mapX(this.x2()), p2y = mapY(this.y2());
    return `M ${p0x} ${p0y} C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3x} ${p3y}`;
  });

  readonly handle1 = computed(() => ({ x1: mapX(0), y1: mapY(0), x2: mapX(this.x1()), y2: mapY(this.y1()), cx: mapX(this.x1()), cy: mapY(this.y1()) }));
  readonly handle2 = computed(() => ({ x1: mapX(1), y1: mapY(1), x2: mapX(this.x2()), y2: mapY(this.y2()), cx: mapX(this.x2()), cy: mapY(this.y2()) }));

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
  presetName(id: string): string {
    return this.t('presets.' + id);
  }
  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  setX1(v: number) { this.x1.set(this.clampNum(v, 0, 1)); }
  setX2(v: number) { this.x2.set(this.clampNum(v, 0, 1)); }
  setY1(v: number) { this.y1.set(this.clampNum(v, -0.5, 1.5)); }
  setY2(v: number) { this.y2.set(this.clampNum(v, -0.5, 1.5)); }
  setDuration(v: number) { this.duration.set(this.clampNum(v, 300, 3000)); }

  applyPreset(p: Preset) {
    this.x1.set(p.v[0]);
    this.y1.set(p.v[1]);
    this.x2.set(p.v[2]);
    this.y2.set(p.v[3]);
    this.copied.set(false);
  }

  playDemo() {
    const dot = this.demoDot()?.nativeElement;
    if (!dot) return;
    this.currentAnim?.cancel();
    this.currentAnim = dot.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(11rem)' }],
      { duration: this.duration(), easing: this.bezier(), fill: 'forwards' }
    );
    this.currentAnim.onfinish = () => {
      window.setTimeout(() => {
        dot.animate([{ transform: 'translateX(11rem)' }, { transform: 'translateX(0)' }], {
          duration: 400,
          easing: 'ease-in-out',
          fill: 'forwards',
        });
      }, 500);
    };
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
    const blob = new Blob([`.animated {\n  transition: transform ${this.duration()}ms ${this.bezier()};\n}`], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'cubic-bezier.css';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
    this.currentAnim?.cancel();
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
