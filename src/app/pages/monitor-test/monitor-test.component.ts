import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-monitor-test',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './monitor-test.component.html',
  styleUrl: './monitor-test.component.scss',
})
export class MonitorTestComponent implements OnDestroy {
  readonly slug = 'monitor-test';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-cropper', 'rotate-flip-photo', 'image-color-extractor'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly running = signal(false);
  readonly slideIndex = signal(0);
  readonly measuring = signal(false);
  readonly fps = signal<number | null>(null);
  readonly resolution = signal('');
  readonly dpr = signal(1);
  readonly colorDepth = signal(0);
  readonly orientation = signal('');

  private rafId = 0;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    const w = window;
    this.resolution.set(`${w.screen.width} × ${w.screen.height}`);
    this.dpr.set(w.devicePixelRatio || 1);
    this.colorDepth.set(w.screen.colorDepth || 0);
    this.orientation.set(w.screen.orientation?.type ?? '');
    w.addEventListener('keydown', this.onKey);
  }

  readonly slides = computed(() => [
    { key: 'black', css: '#000000' },
    { key: 'white', css: '#ffffff' },
    { key: 'red', css: '#ff0000' },
    { key: 'green', css: '#00ff00' },
    { key: 'blue', css: '#0000ff' },
    { key: 'gradient', css: 'linear-gradient(135deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff)' },
    { key: 'grayRamp', css: 'linear-gradient(to right,#000000,#ffffff)' },
    { key: 'checker', css: 'repeating-conic-gradient(#7f7f7f 0% 25%,#ffffff 0% 50%) 0 0 / 48px 48px' },
  ]);

  readonly currentSlide = computed(() => this.slides()[this.slideIndex() % this.slides().length]);

  readonly fpsText = computed(() => {
    const f = this.fps();
    return f === null ? '—' : `${f} Hz`;
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

  slideName(key: string): string {
    return this.t(`labels.slides.${key}`);
  }

  startTest(): void {
    try {
      const el = this.document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      el.requestFullscreen?.();
    } catch {
      /* fullscreen is optional */
    }
    this.slideIndex.set(0);
    this.running.set(true);
  }

  nextSlide(): void {
    this.slideIndex.set((this.slideIndex() + 1) % this.slides().length);
  }

  prevSlide(): void {
    this.slideIndex.set((this.slideIndex() - 1 + this.slides().length) % this.slides().length);
  }

  exitTest(): void {
    this.running.set(false);
    try {
      if (this.document.fullscreenElement) {
        void this.document.exitFullscreen();
      }
    } catch {
      /* noop */
    }
  }

  measureFps(): void {
    if (this.measuring()) return;
    this.measuring.set(true);
    this.fps.set(null);
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 2000) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        const elapsed = (performance.now() - start) / 1000;
        this.fps.set(Math.round(frames / elapsed));
        this.measuring.set(false);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    window.removeEventListener('keydown', this.onKey);
    cancelAnimationFrame(this.rafId);
    try {
      if (this.document.fullscreenElement) {
        void this.document.exitFullscreen();
      }
    } catch {
      /* noop */
    }
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private readonly onKey = (event: KeyboardEvent) => {
    if (!this.running()) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
      event.preventDefault();
      this.nextSlide();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.prevSlide();
    } else if (event.key === 'Escape') {
      this.exitTest();
    }
  };

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
