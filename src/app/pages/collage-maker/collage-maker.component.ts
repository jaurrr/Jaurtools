import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type Layout = '2side' | '3grid' | '2x2' | '1plus2';

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

@Component({
  selector: 'app-collage-maker',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './collage-maker.component.html',
  styleUrl: './collage-maker.component.scss',
})
export class CollageMakerComponent implements OnDestroy {
  readonly slug = 'collage-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-joiner', 'blurred-frame-maker', 'shape-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly layout = signal<Layout>('2x2');
  readonly gap = signal(12);
  readonly bgColor = signal('#0f172a');
  readonly photos = signal<HTMLImageElement[]>([]);
  readonly fileError = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly photoCount = computed(() => this.photos().length);

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

  layoutLabel(l: string): string {
    const map: Record<string, string> = {
      '2side': 'layout2side', '3grid': 'layout3grid', '2x2': 'layout2x2', '1plus2': 'layout1plus2',
    };
    return this.t(`labels.${map[l] ?? 'layout2x2'}`);
  }

  setLayout(l: Layout): void {
    this.layout.set(l);
    this.render();
  }

  setGap(v: number): void {
    this.gap.set(this.clampNum(v, 0, 60));
    this.render();
  }

  setBgColor(c: string): void {
    this.bgColor.set(c);
    this.render();
  }

  clearPhotos(): void {
    this.photos.set([]);
    this.render();
  }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (this.photos().length + files.length > 4) {
      this.fileError.set(this.t('labels.tooMany'));
      return;
    }
    this.fileError.set('');
    let loaded = 0;
    const fresh: HTMLImageElement[] = [];
    const finish = () => {
      if (fresh.length) {
        this.photos.set([...this.photos(), ...fresh].slice(0, 4));
        this.render();
      }
    };
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        if (++loaded === files.length) finish();
        continue;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        fresh.push(img);
        if (++loaded === files.length) finish();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (++loaded === files.length) finish();
      };
      img.src = url;
    }
  }

  private cells(): Cell[] {
    const S = 1200;
    const g = this.gap();
    const l = this.layout();
    if (l === '2side') {
      const w = (S - g) / 2;
      return [
        { x: 0, y: 0, w, h: S },
        { x: w + g, y: 0, w, h: S },
      ];
    }
    if (l === '3grid') {
      const w = (S - 2 * g) / 3;
      return [
        { x: 0, y: 0, w, h: S },
        { x: w + g, y: 0, w, h: S },
        { x: 2 * (w + g), y: 0, w, h: S },
      ];
    }
    if (l === '1plus2') {
      const big = (S * 2) / 3 - g / 2;
      const small = S / 3 - g / 2;
      return [
        { x: 0, y: 0, w: big, h: S },
        { x: big + g, y: 0, w: small, h: (S - g) / 2 },
        { x: big + g, y: (S - g) / 2 + g, w: small, h: (S - g) / 2 },
      ];
    }
    const c = (S - g) / 2;
    return [
      { x: 0, y: 0, w: c, h: c },
      { x: c + g, y: 0, w: c, h: c },
      { x: 0, y: c + g, w: c, h: c },
      { x: c + g, y: c + g, w: c, h: c },
    ];
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 1200;
    canvas.width = S;
    canvas.height = S;
    ctx.fillStyle = this.bgColor();
    ctx.fillRect(0, 0, S, S);
    const cells = this.cells();
    const photos = this.photos();
    cells.forEach((cell, i) => {
      const img = photos[i];
      if (!img) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const sc = Math.max(cell.w / iw, cell.h / ih);
      const dw = iw * sc;
      const dh = ih * sc;
      const dx = cell.x + (cell.w - dw) / 2;
      const dy = cell.y + (cell.h - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cell.x, cell.y, cell.w, cell.h);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    });
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.photoCount() < 2) return;
    const a = this.document.createElement('a');
    a.download = 'collage.png';
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
