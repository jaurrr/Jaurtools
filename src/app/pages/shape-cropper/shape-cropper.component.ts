import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type Shape = 'circle' | 'rounded' | 'triangle' | 'hexagon' | 'star' | 'diamond';
type Bg = 'transparent' | 'white' | 'black';

@Component({
  selector: 'app-shape-cropper',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './shape-cropper.component.html',
  styleUrl: './shape-cropper.component.scss',
})
export class ShapeCropperComponent implements OnDestroy {
  readonly slug = 'shape-cropper';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-border-maker', 'blurred-frame-maker', 'grayscale-converter', 'collage-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly shape = signal<Shape>('circle');
  readonly bg = signal<Bg>('transparent');
  readonly hasImage = signal(false);
  readonly outSize = signal(0);
  readonly fileError = signal('');

  readonly shapes: Shape[] = ['circle', 'rounded', 'triangle', 'hexagon', 'star', 'diamond'];

  private img: HTMLImageElement | null = null;
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

  shapeLabel(s: string): string {
    const map: Record<string, string> = {
      circle: 'shapeCircle', rounded: 'shapeRounded', triangle: 'shapeTriangle',
      hexagon: 'shapeHexagon', star: 'shapeStar', diamond: 'shapeDiamond',
    };
    return this.t(`labels.${map[s] ?? 'shapeCircle'}`);
  }

  setShape(s: Shape): void {
    this.shape.set(s);
    this.render();
  }

  setBg(b: Bg): void {
    this.bg.set(b);
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
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = Math.min(iw, ih);
    canvas.width = s;
    canvas.height = s;
    const sx = (iw - s) / 2;
    const sy = (ih - s) / 2;
    const bg = this.bg();
    if (bg !== 'transparent') {
      ctx.fillStyle = bg === 'white' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, s, s);
    } else {
      ctx.clearRect(0, 0, s, s);
    }
    ctx.save();
    this.traceShape(ctx, this.shape(), s);
    ctx.clip();
    ctx.drawImage(img, sx, sy, s, s, 0, 0, s, s);
    ctx.restore();
    this.outSize.set(s);
  }

  private traceShape(ctx: CanvasRenderingContext2D, shape: Shape, s: number): void {
    const c = s / 2;
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(c, c, c, 0, Math.PI * 2);
    } else if (shape === 'rounded') {
      const r = s * 0.22;
      ctx.roundRect(0, 0, s, s, r);
    } else if (shape === 'triangle') {
      ctx.moveTo(c, 0);
      ctx.lineTo(s, s);
      ctx.lineTo(0, s);
      ctx.closePath();
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = c + c * Math.cos(a);
        const y = c + c * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (shape === 'star') {
      const outer = c;
      const inner = c * 0.42;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const x = c + r * Math.cos(a);
        const y = c + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(c, 0);
      ctx.lineTo(s, c);
      ctx.lineTo(c, s);
      ctx.lineTo(0, c);
      ctx.closePath();
    }
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasImage()) return;
    const a = this.document.createElement('a');
    a.download = 'clipped-image.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
