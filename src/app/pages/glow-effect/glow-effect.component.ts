import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-glow-effect',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './glow-effect.component.html',
  styleUrl: './glow-effect.component.scss',
})
export class GlowEffectComponent implements OnDestroy {
  readonly slug = 'glow-effect';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['duotone-effect', 'emboss-effect', 'edge-detection', 'photo-equalizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly glowColor = signal('#4f46e5');
  readonly intensity = signal(60);
  readonly radius = signal(24);

  private readonly stage = viewChild<ElementRef<HTMLCanvasElement>>('stage');

  private img: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.loaded();
      this.glowColor();
      this.intensity();
      this.radius();
      this.render();
    });
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

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMsg.set('');
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.typeError'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.errorMsg.set(this.t('labels.sizeError'));
      return;
    }
    this.clearImage();
    this.objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.imgW.set(img.naturalWidth);
      this.imgH.set(img.naturalHeight);
      this.fileName.set(file.name);
      this.loaded.set(true);
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
      this.clearImage();
    };
    img.src = this.objectUrl;
  }

  setGlowColor(v: string): void { this.glowColor.set(v); }
  setIntensity(v: number): void { this.intensity.set(this.clampNum(v, 0, 100)); }
  setRadius(v: number): void { this.radius.set(this.clampNum(v, 0, 60)); }

  download(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.loaded()) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `glow-${canvas.width}x${canvas.height}.png`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  clearImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.img = null;
    this.loaded.set(false);
    this.fileName.set('');
    this.errorMsg.set('');
  }

  ngOnDestroy() {
    this.clearImage();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render(): void {
    const canvas = this.stage()?.nativeElement;
    if (!canvas || !this.img || !this.loaded()) return;
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(this.imgW(), this.imgH()));
    const w = Math.max(1, Math.round(this.imgW() * scale));
    const h = Math.max(1, Math.round(this.imgH() * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const glow = this.document.createElement('canvas');
    glow.width = w;
    glow.height = h;
    const g = glow.getContext('2d');
    if (!g) return;
    try {
      g.filter = `blur(${this.radius()}px)`;
    } catch {
      /* older browsers ignore canvas filters */
    }
    g.drawImage(this.img, 0, 0, w, h);
    try {
      g.filter = 'none';
    } catch {
      /* noop */
    }
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = this.glowColor();
    g.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.intensity() / 100;
    ctx.drawImage(glow, 0, 0);
    ctx.drawImage(glow, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.img, 0, 0, w, h);
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
