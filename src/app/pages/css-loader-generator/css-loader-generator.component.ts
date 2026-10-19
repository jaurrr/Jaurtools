import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type LoaderType = 'spinner' | 'dots' | 'bars' | 'ring' | 'pulse';

@Component({
  selector: 'app-css-loader-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './css-loader-generator.component.html',
  styleUrl: './css-loader-generator.component.scss',
})
export class CssLoaderGeneratorComponent implements OnDestroy {
  readonly slug = 'css-loader-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-switch-generator', 'css-text-glitch-generator', 'flexbox-playground'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly loaderType = signal<LoaderType>('spinner');
  readonly size = signal(48);
  readonly color = signal('#4f46e5');
  readonly speed = signal(1);
  readonly copied = signal(false);

  readonly loaderTypes: LoaderType[] = ['spinner', 'dots', 'bars', 'ring', 'pulse'];

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly css = computed(() => {
    const size = this.size();
    const color = this.safeColor(this.color());
    const speed = this.speed();
    switch (this.loaderType()) {
      case 'dots': return this.dotsCss(size, color, speed);
      case 'bars': return this.barsCss(size, color, speed);
      case 'ring': return this.ringCss(size, color, speed);
      case 'pulse': return this.pulseCss(size, color, speed);
      default: return this.spinnerCss(size, color, speed);
    }
  });

  readonly html = computed(() => {
    switch (this.loaderType()) {
      case 'dots':
        return '<div class="css-loader">\n  <span></span>\n  <span></span>\n  <span></span>\n</div>';
      case 'bars':
        return '<div class="css-loader">\n  <span></span>\n  <span></span>\n  <span></span>\n  <span></span>\n</div>';
      default:
        return '<div class="css-loader"></div>';
    }
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

  setLoaderType(v: LoaderType) { this.loaderType.set(v); }
  setSize(v: number) { this.size.set(this.clampNum(v, 16, 128)); }
  setColor(v: string) { this.color.set(this.safeColor(v)); }
  setSpeed(v: number) { this.speed.set(this.clampNum(v, 0.3, 3)); }

  copyText(text: string) {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private safeColor(v: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#4f46e5';
  }

  private rgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private spinnerCss(size: number, color: string, speed: number): string {
    const border = Math.max(2, Math.round(size / 10));
    return `.css-loader {\n  width: ${size}px;\n  height: ${size}px;\n  border: ${border}px solid ${this.rgba(color, 0.2)};\n  border-top-color: ${color};\n  border-radius: 50%;\n  animation: css-loader-spin ${speed}s linear infinite;\n}\n\n@keyframes css-loader-spin {\n  to { transform: rotate(360deg); }\n}`;
  }

  private dotsCss(size: number, color: string, speed: number): string {
    const dot = Math.max(4, Math.round(size / 4));
    const gap = Math.max(3, Math.round(size / 8));
    const lift = Math.round(size / 4);
    const d2 = (speed / 3).toFixed(2);
    const d3 = ((speed / 3) * 2).toFixed(2);
    return `.css-loader {\n  display: inline-flex;\n  gap: ${gap}px;\n}\n\n.css-loader span {\n  width: ${dot}px;\n  height: ${dot}px;\n  border-radius: 50%;\n  background: ${color};\n  animation: css-loader-bounce ${speed}s ease-in-out infinite;\n}\n\n.css-loader span:nth-child(2) { animation-delay: ${d2}s; }\n.css-loader span:nth-child(3) { animation-delay: ${d3}s; }\n\n@keyframes css-loader-bounce {\n  0%, 100% { transform: translateY(0); opacity: 0.4; }\n  50% { transform: translateY(-${lift}px); opacity: 1; }\n}`;
  }

  private barsCss(size: number, color: string, speed: number): string {
    const bar = Math.max(4, Math.round(size / 6));
    const gap = Math.max(3, Math.round(size / 10));
    const delays = [0, 1, 2, 3].map((i) => ((speed / 4) * i).toFixed(2));
    return `.css-loader {\n  display: inline-flex;\n  align-items: flex-end;\n  gap: ${gap}px;\n  height: ${size}px;\n}\n\n.css-loader span {\n  width: ${bar}px;\n  background: ${color};\n  border-radius: 3px;\n  animation: css-loader-bars ${speed}s ease-in-out infinite;\n}\n\n.css-loader span:nth-child(1) { animation-delay: 0s; }\n.css-loader span:nth-child(2) { animation-delay: ${delays[1]}s; }\n.css-loader span:nth-child(3) { animation-delay: ${delays[2]}s; }\n.css-loader span:nth-child(4) { animation-delay: ${delays[3]}s; }\n\n@keyframes css-loader-bars {\n  0%, 100% { height: 30%; }\n  50% { height: 100%; }\n}`;
  }

  private ringCss(size: number, color: string, speed: number): string {
    const border = Math.max(2, Math.round(size / 12));
    return `.css-loader {\n  width: ${size}px;\n  height: ${size}px;\n  border: ${border}px solid ${color};\n  border-radius: 50%;\n  animation: css-loader-ping ${speed}s cubic-bezier(0, 0, 0.2, 1) infinite;\n}\n\n@keyframes css-loader-ping {\n  0% { transform: scale(0.6); opacity: 1; }\n  100% { transform: scale(1.4); opacity: 0; }\n}`;
  }

  private pulseCss(size: number, color: string, speed: number): string {
    return `.css-loader {\n  width: ${size}px;\n  height: ${size}px;\n  border-radius: 50%;\n  background: ${color};\n  animation: css-loader-pulse ${speed}s ease-in-out infinite;\n}\n\n@keyframes css-loader-pulse {\n  0%, 100% { transform: scale(0.7); opacity: 0.5; }\n  50% { transform: scale(1); opacity: 1; }\n}`;
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
