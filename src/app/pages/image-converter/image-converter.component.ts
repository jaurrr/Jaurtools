import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-image-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-converter.component.html',
  styleUrl: './image-converter.component.scss',
})
export class ImageConverterComponent implements OnDestroy {
  readonly slug = 'image-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-compressor', 'image-resizer', 'image-to-base64-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly sourceType = signal('');
  readonly quality = signal(90);
  readonly format = signal<'jpeg' | 'webp' | 'png'>('png');
  readonly bgColor = signal('#ffffff');
  readonly convertedUrl = signal('');
  readonly convertedSize = signal(0);
  readonly convertedName = signal('');
  readonly processing = signal(false);

  private objectUrl: string | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);
  readonly needsBackground = computed(() => this.format() === 'jpeg');
  readonly mimeType = computed(() => `image/${this.format()}`);
  readonly formats = computed(() => [
    { value: 'jpeg', label: this.t('labels.formatJpeg') },
    { value: 'webp', label: this.t('labels.formatWebp') },
    { value: 'png', label: this.t('labels.formatPng') },
  ]);

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

  setQuality(v: number) {
    this.quality.set(this.clampNum(v, 10, 100));
  }
  setFormat(f: string) {
    if (f === 'jpeg' || f === 'webp' || f === 'png') this.format.set(f);
  }
  setBgColor(v: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) this.bgColor.set(v);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.sourceType.set('');
    this.convertedSize.set(0);
    this.convertedName.set('');
    if (this.convertedUrl()) {
      URL.revokeObjectURL(this.convertedUrl());
      this.convertedUrl.set('');
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  convert() {
    if (!this.objectUrl) return;
    this.processing.set(true);
    this.error.set('');
    const img = new Image();
    img.onload = () => {
      try {
        this.runConvert(img);
      } catch {
        this.error.set(this.t('labels.convertFailed'));
      }
      this.processing.set(false);
    };
    img.onerror = () => {
      this.error.set(this.t('labels.loadFailed'));
      this.processing.set(false);
    };
    img.src = this.objectUrl;
  }

  private runConvert(img: HTMLImageElement) {
    const canvas = this.document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.error.set(this.t('labels.convertFailed'));
      return;
    }
    if (this.format() === 'jpeg') {
      ctx.fillStyle = this.bgColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const quality = this.format() === 'png' ? undefined : this.quality() / 100;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set(this.t('labels.convertFailed'));
          return;
        }
        if (this.convertedUrl()) URL.revokeObjectURL(this.convertedUrl());
        this.convertedUrl.set(URL.createObjectURL(blob));
        this.convertedSize.set(blob.size);
        const dot = this.fileName().lastIndexOf('.');
        const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
        const ext = this.format() === 'jpeg' ? 'jpg' : this.format();
        this.convertedName.set(`${base}-converted.${ext}`);
      },
      this.mimeType(),
      quality
    );
  }

  formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val >= 100 ? Math.round(val) : Math.round(val * 10) / 10} ${units[i]}`;
  }

  private loadFile(file: File) {
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    this.sourceType.set(file.type || this.t('labels.unknownType'));
    this.convertedSize.set(0);
    if (this.convertedUrl()) {
      URL.revokeObjectURL(this.convertedUrl());
      this.convertedUrl.set('');
    }
  }

  ngOnDestroy() {
    if (this.convertedUrl()) URL.revokeObjectURL(this.convertedUrl());
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
