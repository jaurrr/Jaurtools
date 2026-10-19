import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface CensorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

@Component({
  selector: 'app-photo-blur',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-blur.component.html',
  styleUrl: './photo-blur.component.scss',
})
export class PhotoBlurComponent implements OnDestroy {
  readonly slug = 'photo-blur';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['film-grain-effect', 'grayscale-converter', 'shape-cropper', 'blurred-frame-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly mode = signal<'blur' | 'pixelate'>('blur');
  readonly strength = signal(12);
  readonly regions = signal<CensorRect[]>([]);
  readonly hasImage = signal(false);
  readonly fileError = signal('');

  private img: HTMLImageElement | null = null;
  private drawing: { x: number; y: number } | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly regionCount = computed(() => this.regions().length);

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

  setMode(m: 'blur' | 'pixelate'): void {
    this.mode.set(m);
    this.render();
  }

  setStrength(v: number): void {
    this.strength.set(this.clampNum(v, 2, 40));
    this.render();
  }

  removeRegion(i: number): void {
    this.regions.set(this.regions().filter((_, idx) => idx !== i));
    this.render();
  }

  clearRegions(): void {
    this.regions.set([]);
    this.render();
  }

  px(v: number): number {
    return Math.round(v);
  }

  onPointerDown(ev: PointerEvent): void {
    if (!this.hasImage()) return;
    const p = this.toCanvasPoint(ev);
    this.drawing = p;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  onPointerUp(ev: PointerEvent): void {
    if (!this.drawing) return;
    const p = this.toCanvasPoint(ev);
    const start = this.drawing;
    this.drawing = null;
    const x = Math.min(start.x, p.x);
    const y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x);
    const h = Math.abs(p.y - start.y);
    if (w < 8 || h < 8) {
      this.render();
      return;
    }
    this.regions.set([...this.regions(), { x, y, w, h }]);
    this.render();
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.fileError.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.fileError.set(this.t('labels.fileTooLarge'));
      return;
    }
    this.fileError.set('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.hasImage.set(true);
      this.regions.set([]);
      URL.revokeObjectURL(url);
      this.render();
    };
    img.onerror = () => {
      this.fileError.set(this.t('labels.loadFailed'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const img = this.img;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.filter = 'none';
    ctx.drawImage(img, 0, 0);
    for (const r of this.regions()) {
      if (this.mode() === 'blur') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.filter = `blur(${this.strength()}px)`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        const block = Math.max(2, Math.round(this.strength()));
        const sw = Math.max(1, Math.ceil(r.w / block));
        const sh = Math.max(1, Math.ceil(r.h / block));
        const tiny = this.document.createElement('canvas');
        tiny.width = sw;
        tiny.height = sh;
        const tctx = tiny.getContext('2d');
        if (!tctx) continue;
        tctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tiny, 0, 0, sw, sh, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    }
    ctx.filter = 'none';
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasImage()) return;
    const a = this.document.createElement('a');
    a.download = 'censored-photo.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private toCanvasPoint(ev: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef()?.nativeElement;
    const rect = (ev.target as HTMLElement).getBoundingClientRect();
    const scaleX = canvas ? canvas.width / rect.width : 1;
    const scaleY = canvas ? canvas.height / rect.height : 1;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    };
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
