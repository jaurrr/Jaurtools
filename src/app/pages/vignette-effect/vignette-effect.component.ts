import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type VignetteShape = 'ellipse' | 'circle';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-vignette-effect',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './vignette-effect.component.html',
  styleUrl: './vignette-effect.component.scss',
})
export class VignetteEffectComponent implements OnDestroy {
  readonly slug = 'vignette-effect';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['youtube-thumbnail-downloader', 'qr-code-generator', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly hasImage = signal(false);
  readonly fileName = signal('');
  readonly intensity = signal(45);
  readonly feather = signal(60);
  readonly shape = signal<VignetteShape>('ellipse');
  readonly error = signal('');

  private sourceImg: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
  private downloadUrl: string | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
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
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.errType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.error.set(this.t('labels.errSize'));
      return;
    }
    this.error.set('');
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.sourceImg = img;
      this.fileName.set(file.name);
      this.hasImage.set(true);
      this.error.set('');
      setTimeout(() => this.render(), 0);
    };
    img.onerror = () => {
      this.sourceImg = null;
      this.hasImage.set(false);
      this.error.set(this.t('labels.errLoad'));
    };
    img.src = this.objectUrl;
  }

  setIntensity(v: number): void {
    this.intensity.set(this.clampNum(v, 0, 100));
    this.render();
  }
  setFeather(v: number): void {
    this.feather.set(this.clampNum(v, 0, 100));
    this.render();
  }
  setShape(s: VignetteShape): void {
    this.shape.set(s);
    this.render();
  }
  reset(): void {
    this.intensity.set(45);
    this.feather.set(60);
    this.shape.set('ellipse');
    this.render();
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasImage()) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = this.downloadUrl;
      a.download = 'jaurtools-vignette.png';
      this.document.body.appendChild(a);
      a.click();
      a.remove();
    }, 'image/png');
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const img = this.sourceImg;
    if (!canvas || !img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const intensity = this.intensity() / 100;
    if (intensity <= 0) return;
    const feather = this.feather() / 100;
    const innerFrac = 0.85 - 0.75 * feather;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    const ellipse = this.shape() === 'ellipse';
    if (ellipse) ctx.scale(1, h / w);
    const r = ellipse ? w / 2 : Math.max(w, h) / 2;
    const g = ctx.createRadialGradient(0, 0, Math.max(1, r * innerFrac), 0, 0, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${intensity.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }
  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
  }
  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }
  private setLink(rel: string, href: string, hreflang?: string): void {
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
  private refreshJsonLd(): void {
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
