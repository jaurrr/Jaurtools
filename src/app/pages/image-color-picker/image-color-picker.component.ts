import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface PickedColor {
  hex: string;
  rgb: string;
  rgba: string;
  hsl: string;
}

@Component({
  selector: 'app-image-color-picker',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-color-picker.component.html',
  styleUrl: './image-color-picker.component.scss',
})
export class ImageColorPickerComponent implements OnDestroy {
  readonly slug = 'image-color-picker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-color-extractor', 'image-histogram'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly hovered = signal<PickedColor | null>(null);
  readonly picked = signal<PickedColor | null>(null);
  readonly copiedKey = signal('');

  private objectUrl: string | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private imgEl: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private loupe: HTMLCanvasElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);

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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.hovered.set(null);
    this.picked.set(null);
    this.imgEl = null;
    this.canvas = null;
    this.loupe = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  onCanvasMove(event: MouseEvent) {
    const c = this.readPixel(event);
    if (c) this.hovered.set(c);
    this.drawLoupe(event);
  }

  onCanvasLeave() {
    this.hovered.set(null);
    if (this.loupe) this.loupe.style.display = 'none';
  }

  private drawLoupe(event: MouseEvent) {
    const src = this.canvas;
    const loupe = this.loupe;
    if (!src || !loupe) return;
    const target = event.target as HTMLCanvasElement;
    const rect = target.getBoundingClientRect();
    const wrap = this.document.getElementById('icp-canvas');
    const wrapRect = wrap?.getBoundingClientRect();
    if (!wrapRect || rect.width <= 0) return;
    const lctx = loupe.getContext('2d');
    if (!lctx) return;
    const scaleX = src.width / rect.width;
    const scaleY = src.height / rect.height;
    const sx = (event.clientX - rect.left) * scaleX;
    const sy = (event.clientY - rect.top) * scaleY;
    const cells = 9;
    const zoom = Math.max(6, Math.round(120 / cells));
    loupe.width = cells * zoom;
    loupe.height = cells * zoom;
    lctx.imageSmoothingEnabled = false;
    lctx.clearRect(0, 0, loupe.width, loupe.height);
    lctx.drawImage(src, sx - cells / 2, sy - cells / 2, cells, cells, 0, 0, loupe.width, loupe.height);
    lctx.strokeStyle = '#ffffff';
    lctx.lineWidth = 2;
    const c0 = loupe.width / 2;
    lctx.strokeRect(c0 - zoom / 2, c0 - zoom / 2, zoom, zoom);
    lctx.strokeStyle = 'rgba(0,0,0,0.45)';
    lctx.lineWidth = 1;
    lctx.strokeRect(c0 - zoom / 2 - 1, c0 - zoom / 2 - 1, zoom + 2, zoom + 2);
    const offX = event.clientX - wrapRect.left + 18;
    const offY = event.clientY - wrapRect.top - loupe.height - 14;
    loupe.style.left = `${Math.min(Math.max(0, offX), Math.max(0, wrapRect.width - loupe.width))}px`;
    loupe.style.top = `${Math.max(0, offY)}px`;
    loupe.style.display = 'block';
  }

  onCanvasClick(event: MouseEvent) {
    const c = this.readPixel(event);
    if (c) this.picked.set(c);
  }

  copyValue(text: string, key: string) {
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedKey.set(key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(''), 2000);
    }).catch(() => undefined);
  }

  private readPixel(event: MouseEvent): PickedColor | null {
    const target = event.target as HTMLCanvasElement;
    if (!target || !this.imgEl) return null;
    const rect = target.getBoundingClientRect();
    const scaleX = this.imgEl.naturalWidth / rect.width;
    const scaleY = this.imgEl.naturalHeight / rect.height;
    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);
    const canvas = this.canvas;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const px = ctx.getImageData(
      Math.min(x, canvas.width - 1),
      Math.min(y, canvas.height - 1),
      1,
      1
    ).data;
    return this.toColor(px[0], px[1], px[2], px[3]);
  }

  private toColor(r: number, g: number, b: number, a: number): PickedColor {
    const hex =
      '#' +
      [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    const alpha = Math.round((a / 255) * 100) / 100;
    const rf = r / 255;
    const gf = g / 255;
    const bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
      else if (max === gf) h = 60 * ((bf - rf) / delta + 2);
      else h = 60 * ((rf - gf) / delta + 4);
    }
    if (h < 0) h += 360;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return {
      hex,
      rgb: `rgb(${r}, ${g}, ${b})`,
      rgba: `rgba(${r}, ${g}, ${b}, ${alpha})`,
      hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
    };
  }

  private loadFile(file: File) {
    this.error.set('');
    this.copiedKey.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    this.hovered.set(null);
    this.picked.set(null);
    const img = new Image();
    img.onload = () => {
      this.imgEl = img;
      const canvas = this.document.createElement('canvas');
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        this.error.set(this.t('labels.loadFailed'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      this.canvas = canvas;
      const view = this.document.getElementById('icp-canvas');
      view?.replaceChildren(canvas);
      const loupe = this.document.createElement('canvas');
      loupe.className = 'loupe';
      loupe.width = 120;
      loupe.height = 120;
      loupe.style.display = 'none';
      loupe.setAttribute('aria-hidden', 'true');
      view?.appendChild(loupe);
      this.loupe = loupe;
      canvas.setAttribute('aria-label', this.t('labels.canvasLabel'));
      canvas.style.cursor = 'crosshair';
      canvas.addEventListener('mousemove', (e) => this.onCanvasMove(e));
      canvas.addEventListener('mouseleave', () => this.onCanvasLeave());
      canvas.addEventListener('click', (e) => this.onCanvasClick(e));
      canvas.addEventListener(
        'touchstart',
        (e) => {
          const touch = e.touches[0];
          if (touch) this.readTouchPixel(canvas, touch.clientX, touch.clientY);
        },
        { passive: true }
      );
    };
    img.onerror = () => this.error.set(this.t('labels.loadFailed'));
    img.src = this.objectUrl;
  }

  private readTouchPixel(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    if (!this.imgEl) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = this.imgEl.naturalWidth / rect.width;
    const scaleY = this.imgEl.naturalHeight / rect.height;
    const x = Math.floor((clientX - rect.left) * scaleX);
    const y = Math.floor((clientY - rect.top) * scaleY);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const px = ctx.getImageData(
      Math.min(x, this.canvas!.width - 1),
      Math.min(y, this.canvas!.height - 1),
      1,
      1
    ).data;
    this.picked.set(this.toColor(px[0], px[1], px[2], px[3]));
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
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
