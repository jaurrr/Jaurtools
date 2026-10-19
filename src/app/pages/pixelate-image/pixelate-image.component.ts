import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-pixelate-image',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './pixelate-image.component.html',
  styleUrl: './pixelate-image.component.scss',
})
export class PixelateImageComponent implements OnDestroy {
  readonly slug = 'pixelate-image';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-denoiser', 'sharpen-image', 'sepia-effect', 'posterize-effect'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly blockSize = signal(16);
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly errorMsg = signal('');

  readonly blockCount = computed(() => {
    const im = this.image();
    if (!im) return { cols: 0, rows: 0 };
    const b = Math.max(2, this.blockSize());
    return { cols: Math.max(1, Math.round(im.width / b)), rows: Math.max(1, Math.round(im.height / b)) };
  });

  readonly hasOutput = computed(() => this.image() !== null);

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('pixelCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
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

  setBlockSize(v: number): void { this.blockSize.set(this.clampNum(v, 2, 64)); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.92);
    a.download = `pixelated-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
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
    const im = this.image();
    if (!canvas || !im) return;
    canvas.width = im.width;
    canvas.height = im.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { cols, rows } = this.blockCount();
    const tiny = this.document.createElement('canvas');
    tiny.width = cols;
    tiny.height = rows;
    const tctx = tiny.getContext('2d');
    if (!tctx) return;
    tctx.drawImage(im.img, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, im.width, im.height);
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
