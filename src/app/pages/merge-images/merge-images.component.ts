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

@Component({
  selector: 'app-merge-images',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './merge-images.component.html',
  styleUrl: './merge-images.component.scss',
})
export class MergeImagesComponent implements OnDestroy {
  readonly slug = 'merge-images';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-overlay', 'image-splitter', 'image-resizer', 'round-corners'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly direction = signal<'vertical' | 'horizontal'>('vertical');
  readonly align = signal<'start' | 'center' | 'end'>('center');
  readonly spacing = signal(0);
  readonly bgColor = signal('#ffffff');
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly imageA = signal<LoadedImage | null>(null);
  readonly imageB = signal<LoadedImage | null>(null);
  readonly errorMsg = signal('');
  readonly outputUrl = signal('');

  readonly hasOutput = computed(() => this.imageA() !== null && this.imageB() !== null);

  readonly outputSize = computed(() => {
    const a = this.imageA();
    const b = this.imageB();
    if (!a || !b) return { width: 0, height: 0 };
    const s = this.spacing();
    if (this.direction() === 'vertical') {
      return { width: Math.max(a.width, b.width), height: a.height + s + b.height };
    }
    return { width: a.width + s + b.width, height: Math.max(a.height, b.height) };
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('mergeCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
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

  onFile(event: Event, slot: 'a' | 'b'): void {
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
      if (slot === 'a') this.imageA.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
      else this.imageB.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    };
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setDirection(d: 'vertical' | 'horizontal'): void { this.direction.set(d); }
  setAlign(a: 'start' | 'center' | 'end'): void { this.align.set(a); }
  setSpacing(v: number): void { this.spacing.set(this.clampNum(v, 0, 100)); }
  setBgColor(c: string): void { this.bgColor.set(c); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.92);
    a.download = `merged-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
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
    const a = this.imageA();
    const b = this.imageB();
    if (!canvas) return;
    if (!a || !b) {
      this.outputUrl.set('');
      return;
    }
    const size = this.outputSize();
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = this.bgColor();
    ctx.fillRect(0, 0, size.width, size.height);
    const s = this.spacing();
    const cross = (imgW: number, imgH: number, total: number): number => {
      if (this.align() === 'start') return 0;
      if (this.align() === 'end') return total - (this.direction() === 'vertical' ? imgW : imgH);
      return Math.round((total - (this.direction() === 'vertical' ? imgW : imgH)) / 2);
    };
    if (this.direction() === 'vertical') {
      ctx.drawImage(a.img, cross(a.width, a.height, size.width), 0);
      ctx.drawImage(b.img, cross(b.width, b.height, size.width), a.height + s);
    } else {
      ctx.drawImage(a.img, 0, cross(a.width, a.height, size.height));
      ctx.drawImage(b.img, a.width + s, cross(b.width, b.height, size.height));
    }
    this.outputUrl.set(canvas.toDataURL('image/png'));
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
