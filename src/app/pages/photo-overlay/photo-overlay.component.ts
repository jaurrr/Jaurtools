import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface LoadedImage {
  img: HTMLImageElement;
  width: number;
  height: number;
  name: string;
}

type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
type Position = 'tl' | 'tc' | 'tr' | 'cl' | 'c' | 'cr' | 'bl' | 'bc' | 'br';

@Component({
  selector: 'app-photo-overlay',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-overlay.component.html',
  styleUrl: './photo-overlay.component.scss',
})
export class PhotoOverlayComponent implements OnDestroy {
  readonly slug = 'photo-overlay';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['merge-images', 'solid-background-remover', 'image-resizer', 'round-corners'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly base = signal<LoadedImage | null>(null);
  readonly top = signal<LoadedImage | null>(null);
  readonly opacity = signal(60);
  readonly blend = signal<Blend>('source-over');
  readonly overlayScale = signal(50);
  readonly position = signal<Position>('c');
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly errorMsg = signal('');

  readonly blends: Blend[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
  readonly positions: Position[] = ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br'];

  readonly hasOutput = computed(() => this.base() !== null && this.top() !== null);

  readonly overlaySize = computed(() => {
    const t = this.top();
    if (!t) return { width: 0, height: 0 };
    const k = this.overlayScale() / 100;
    return { width: Math.max(1, Math.round(t.width * k)), height: Math.max(1, Math.round(t.height * k)) };
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('overlayCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private objectUrls: string[] = [];
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

  onFile(event: Event, slot: 'base' | 'top'): void {
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
    img.onload = () => {
      const rec = { img, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
      if (slot === 'base') this.base.set(rec);
      else this.top.set(rec);
    };
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setOpacity(v: number): void { this.opacity.set(this.clampNum(v, 0, 100)); }
  setBlend(b: Blend): void { this.blend.set(b); }
  setOverlayScale(v: number): void { this.overlayScale.set(this.clampNum(v, 5, 200)); }
  setPosition(p: Position): void { this.position.set(p); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.92);
    a.download = `overlay-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    const base = this.base();
    const top = this.top();
    if (!canvas || !base || !top) return;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(base.img, 0, 0);
    const size = this.overlaySize();
    const { x, y } = this.anchor(size.width, size.height, base.width, base.height);
    ctx.globalAlpha = this.opacity() / 100;
    ctx.globalCompositeOperation = this.blend();
    ctx.drawImage(top.img, x, y, size.width, size.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private anchor(ow: number, oh: number, bw: number, bh: number): { x: number; y: number } {
    const p = this.position();
    const x = p.includes('l') ? 0 : p.includes('r') ? bw - ow : Math.round((bw - ow) / 2);
    const y = p[0] === 't' ? 0 : p[0] === 'b' ? bh - oh : Math.round((bh - oh) / 2);
    return { x, y };
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
