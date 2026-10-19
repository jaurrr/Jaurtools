import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type Symmetry = 'none' | 'x' | 'y' | 'xy';

@Component({
  selector: 'app-pixel-art-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './pixel-art-generator.component.html',
  styleUrl: './pixel-art-generator.component.scss',
})
export class PixelArtGeneratorComponent implements OnDestroy {
  readonly slug = 'pixel-art-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pixelate-image', 'posterize-effect', 'image-to-svg-converter', 'image-resizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly cols = signal(24);
  readonly rows = signal(24);
  readonly cellSize = signal(12);
  readonly colorA = signal('#4f46e5');
  readonly colorB = signal('#f8fafc');
  readonly density = signal(50);
  readonly symmetry = signal<Symmetry>('none');
  readonly seed = signal(1);

  readonly symmetries: Symmetry[] = ['none', 'x', 'y', 'xy'];

  readonly canvasSize = computed(() => ({
    width: this.cols() * this.cellSize(),
    height: this.rows() * this.cellSize(),
  }));

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('bitmapCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.render();
    });
  }

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

  setCols(v: number): void { this.cols.set(this.clampNum(v, 4, 128)); }
  setRows(v: number): void { this.rows.set(this.clampNum(v, 4, 128)); }
  setCellSize(v: number): void { this.cellSize.set(this.clampNum(v, 2, 32)); }
  setColorA(c: string): void { this.colorA.set(c); }
  setColorB(c: string): void { this.colorB.set(c); }
  setDensity(v: number): void { this.density.set(this.clampNum(v, 5, 95)); }
  setSymmetry(s: Symmetry): void { this.symmetry.set(s); }
  regenerate(): void { this.seed.update((s) => s + 1); }

  randomizeColors(): void {
    const rand = this.makeRandom(Date.now() % 2147483647);
    const hue = () => Math.floor(rand() * 360);
    this.colorA.set(`hsl(${hue()}, 70%, 45%)`);
    this.colorB.set(`hsl(${hue()}, 60%, 92%)`);
  }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'random-bitmap.png';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private makeRandom(seed: number): () => number {
    let s = (seed * 2654435761 + 40503) >>> 0;
    if (s === 0) s = 1;
    return () => {
      s = (s ^ (s >>> 15)) >>> 0;
      s = (s + (s << 7)) >>> 0;
      s = (s ^ (s >>> 12)) >>> 0;
      if (s === 0) s = 1;
      return s / 4294967296;
    };
  }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const size = this.canvasSize();
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = this.cols();
    const r = this.rows();
    const cell = this.cellSize();
    const dens = this.density() / 100;
    const sym = this.symmetry();
    const rand = this.makeRandom(this.seed());
    const mirrorX = sym === 'x' || sym === 'xy';
    const mirrorY = sym === 'y' || sym === 'xy';
    const gw = mirrorX ? Math.ceil(c / 2) : c;
    const gh = mirrorY ? Math.ceil(r / 2) : r;
    const grid: boolean[][] = [];
    for (let y = 0; y < gh; y++) {
      grid[y] = [];
      for (let x = 0; x < gw; x++) grid[y][x] = rand() < dens;
    }
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < c; x++) {
        const sx = mirrorX ? Math.min(x, c - 1 - x) : x;
        const sy = mirrorY ? Math.min(y, r - 1 - y) : y;
        const on = grid[Math.min(sy, gh - 1)][Math.min(sx, gw - 1)];
        ctx.fillStyle = on ? this.colorA() : this.colorB();
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
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
