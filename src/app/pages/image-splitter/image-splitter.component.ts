import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface Tile {
  row: number;
  col: number;
  width: number;
  height: number;
  url: string;
  name: string;
}

@Component({
  selector: 'app-image-splitter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-splitter.component.html',
  styleUrl: './image-splitter.component.scss',
})
export class ImageSplitterComponent implements OnDestroy {
  readonly slug = 'image-splitter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-images', 'image-resizer', 'photo-overlay', 'round-corners'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly rows = signal(2);
  readonly cols = signal(2);
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly errorMsg = signal('');
  readonly tiles = signal<Tile[]>([]);

  readonly hasOutput = computed(() => this.tiles().length > 0);
  readonly tileCount = computed(() => this.rows() * this.cols());

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  private objectUrls: string[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.split();
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

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.invalidType'));
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.fileTooLarge'));
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    const url = URL.createObjectURL(file);
    this.objectUrls.push(url);
    const img = new Image();
    img.onload = () => this.image.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setRows(v: number): void { this.rows.set(this.clampNum(v, 1, 10)); }
  setCols(v: number): void { this.cols.set(this.clampNum(v, 1, 10)); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  downloadAll(): void {
    const tiles = this.tiles();
    tiles.forEach((tile, i) => {
      setTimeout(() => this.triggerDownload(tile.url, tile.name), i * 350);
    });
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    for (const tile of this.tiles()) URL.revokeObjectURL(tile.url);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private split(): void {
    for (const tile of this.tiles()) URL.revokeObjectURL(tile.url);
    const im = this.image();
    if (!im) {
      this.tiles.set([]);
      return;
    }
    const rows = this.rows();
    const cols = this.cols();
    const baseName = im.name.replace(/\.[a-z0-9]+$/i, '') || 'image';
    const ext = this.format() === 'png' ? 'png' : 'jpg';
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const tiles: Tile[] = [];
    const tw = Math.floor(im.width / cols);
    const th = Math.floor(im.height / rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tw;
        const y = r * th;
        const w = c === cols - 1 ? im.width - x : tw;
        const h = r === rows - 1 ? im.height - y : th;
        const tileCanvas = this.document.createElement('canvas');
        tileCanvas.width = w;
        tileCanvas.height = h;
        const tctx = tileCanvas.getContext('2d');
        if (!tctx) continue;
        tctx.drawImage(im.img, x, y, w, h, 0, 0, w, h);
        const blob = this.dataUrlToBlob(tileCanvas.toDataURL(mime, 0.92));
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        tiles.push({ row: r + 1, col: c + 1, width: w, height: h, url, name: `${baseName}-r${r + 1}c${c + 1}.${ext}` });
      }
    }
    this.tiles.set(tiles);
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  private triggerDownload(url: string, name: string): void {
    const a = this.document.createElement('a');
    a.href = url;
    a.download = name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
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
