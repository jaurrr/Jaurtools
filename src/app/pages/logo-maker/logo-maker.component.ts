import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type BgShape = 'none' | 'circle' | 'rounded' | 'square';

const FONTS = ['Arial', 'Georgia', 'Verdana', 'Courier New', 'Times New Roman', 'Trebuchet MS'];

@Component({
  selector: 'app-logo-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './logo-maker.component.html',
  styleUrl: './logo-maker.component.scss',
})
export class LogoMakerComponent implements OnDestroy, AfterViewInit {
  readonly slug = 'logo-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ascii-art-generator', 'handwriting-to-font-converter', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fonts = FONTS;
  readonly text = signal('JT');
  readonly fontFamily = signal('Arial');
  readonly fontSize = signal(46);
  readonly textColor = signal('#ffffff');
  readonly bgShape = signal<BgShape>('circle');
  readonly bgColor = signal('#4f46e5');
  readonly bold = signal(true);

  private previewRef = viewChild<ElementRef<HTMLCanvasElement>>('preview');
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

  setText(v: string) {
    this.text.set(v.slice(0, 12));
    this.render();
  }
  setFontFamily(v: string) {
    this.fontFamily.set(v);
    this.render();
  }
  setFontSize(v: number) {
    this.fontSize.set(this.clampNum(v, 10, 90));
    this.render();
  }
  setTextColor(v: string) {
    this.textColor.set(v);
    this.render();
  }
  setBgShape(s: BgShape) {
    this.bgShape.set(s);
    this.render();
  }
  setBgColor(v: string) {
    this.bgColor.set(v);
    this.render();
  }
  toggleBold() {
    this.bold.update((v) => !v);
    this.render();
  }

  ngAfterViewInit() {
    this.render();
  }

  exportPng() {
    const size = 1024;
    const canvas = this.document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.drawLogo(ctx, size);
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'logo.png';
    a.click();
  }

  exportSvg() {
    const s = 512;
    const cx = s / 2;
    const cy = s / 2;
    const r = s * 0.42;
    const fs = (this.fontSize() / 100) * s;
    const weight = this.bold() ? 'bold' : 'normal';
    const label = this.text().trim() === '' ? '?' : this.text();
    let shape = '';
    if (this.bgShape() === 'circle') {
      shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${this.bgColor()}"/>`;
    } else if (this.bgShape() === 'rounded') {
      const side = s * 0.84;
      shape = `<rect x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" rx="${side * 0.22}" fill="${this.bgColor()}"/>`;
    } else if (this.bgShape() === 'square') {
      const side = s * 0.84;
      shape = `<rect x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" fill="${this.bgColor()}"/>`;
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
      `<rect width="${s}" height="${s}" fill="#ffffff"/>${shape}` +
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${this.fontFamily()}, sans-serif" font-weight="${weight}" font-size="${fs}" fill="${this.textColor()}">${this.escapeXml(label)}</text></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'logo.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render() {
    const canvas = this.previewRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.drawLogo(ctx, canvas.width);
  }

  private drawLogo(ctx: CanvasRenderingContext2D, size: number) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const shape = this.bgShape();
    if (shape !== 'none') {
      ctx.fillStyle = this.bgColor();
      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const side = size * 0.84;
        const x = cx - side / 2;
        const y = cy - side / 2;
        const radius = shape === 'rounded' ? side * 0.22 : 0;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, side, side, radius);
        } else {
          ctx.rect(x, y, side, side);
        }
        ctx.fill();
      }
    }
    const label = this.text().trim() === '' ? '?' : this.text();
    const fs = (this.fontSize() / 100) * size;
    ctx.fillStyle = this.textColor();
    ctx.font = `${this.bold() ? '700' : '400'} ${fs}px ${this.fontFamily()}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v)));
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
