import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ColorStop {
  color: string;
  pos: number;
}

interface SizePreset {
  value: string;
  w: number;
  h: number;
}

@Component({
  selector: 'app-gradient-wallpaper-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './gradient-wallpaper-maker.component.html',
  styleUrl: './gradient-wallpaper-maker.component.scss',
})
export class GradientWallpaperMakerComponent implements OnDestroy {
  readonly slug = 'gradient-wallpaper-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-color-picker', 'image-color-extractor'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly gradType = signal<'linear' | 'radial'>('linear');
  readonly angle = signal(135);
  readonly stops = signal<ColorStop[]>([
    { color: '#4f46e5', pos: 0 },
    { color: '#9333ea', pos: 100 },
  ]);
  readonly sizePreset = signal('1920x1080');
  readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly sizePresets = computed<SizePreset[]>(() => [
    { value: '1920x1080', w: 1920, h: 1080 },
    { value: '1366x768', w: 1366, h: 768 },
    { value: '1080x1920', w: 1080, h: 1920 },
    { value: '1080x1080', w: 1080, h: 1080 },
    { value: '800x600', w: 800, h: 600 },
  ]);

  readonly cssGradient = computed(() => {
    const stops = [...this.stops()].sort((a, b) => a.pos - b.pos);
    const stopsCss = stops.map((s) => `${s.color} ${s.pos}%`).join(', ');
    return this.gradType() === 'linear'
      ? `linear-gradient(${this.angle()}deg, ${stopsCss})`
      : `radial-gradient(circle, ${stopsCss})`;
  });

  readonly dimensions = computed(() => {
    const p = this.sizePresets().find((s) => s.value === this.sizePreset());
    return p ?? this.sizePresets()[0];
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

  setType(t: 'linear' | 'radial') {
    this.gradType.set(t);
  }
  setAngle(v: number) {
    this.angle.set(this.clampNum(v, 0, 360));
  }
  setStopColor(i: number, color: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    const stops = [...this.stops()];
    stops[i] = { ...stops[i], color };
    this.stops.set(stops);
  }
  setStopPos(i: number, pos: number) {
    const stops = [...this.stops()];
    stops[i] = { ...stops[i], pos: this.clampNum(pos, 0, 100) };
    this.stops.set(stops);
  }
  addStop() {
    const stops = [...this.stops()];
    if (stops.length >= 5) return;
    stops.push({ color: '#06b6d4', pos: 50 });
    this.stops.set(stops);
  }
  removeStop(i: number) {
    const stops = [...this.stops()];
    if (stops.length <= 2) return;
    stops.splice(i, 1);
    this.stops.set(stops);
  }
  setSizePreset(v: string) {
    this.sizePreset.set(v);
  }

  copyCss() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(`background: ${this.cssGradient()};`).then(() => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  download() {
    const dim = this.dimensions();
    const canvas = this.document.createElement('canvas');
    canvas.width = dim.w;
    canvas.height = dim.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stops = [...this.stops()].sort((a, b) => a.pos - b.pos);
    let grad: CanvasGradient;
    if (this.gradType() === 'linear') {
      const rad = ((this.angle() - 90) * Math.PI) / 180;
      const cx = dim.w / 2;
      const cy = dim.h / 2;
      const diag = Math.sqrt(dim.w * dim.w + dim.h * dim.h) / 2;
      grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * diag,
        cy - Math.sin(rad) * diag,
        cx + Math.cos(rad) * diag,
        cy + Math.sin(rad) * diag
      );
    } else {
      const r = Math.sqrt(dim.w * dim.w + dim.h * dim.h) / 2;
      grad = ctx.createRadialGradient(dim.w / 2, dim.h / 2, 0, dim.w / 2, dim.h / 2, r);
    }
    for (const s of stops) grad.addColorStop(s.pos / 100, s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dim.w, dim.h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = url;
      a.download = `gradient-${dim.w}x${dim.h}.png`;
      this.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
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
