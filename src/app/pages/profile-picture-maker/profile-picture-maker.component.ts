import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-profile-picture-maker',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './profile-picture-maker.component.html',
  styleUrl: './profile-picture-maker.component.scss',
})
export class ProfilePictureMakerComponent implements OnDestroy {
  readonly slug = 'profile-picture-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-cropper', 'image-resizer', 'meme-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly ringColor = signal('#4f46e5');
  readonly ringWidth = signal(8);
  readonly outputSize = signal(512);
  readonly previewUrl = signal('');

  private objectUrl: string | null = null;
  private imgEl: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);
  readonly sizes = computed(() => [
    { value: 256, label: '256 × 256' },
    { value: 512, label: '512 × 512' },
    { value: 1024, label: '1024 × 1024' },
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

  setRingColor(v: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      this.ringColor.set(v);
      this.renderPreview();
    }
  }
  setRingWidth(v: number) {
    this.ringWidth.set(this.clampNum(v, 0, 40));
    this.renderPreview();
  }
  readonly platforms = [
    { name: 'Discord', size: 128 },
    { name: 'Facebook', size: 170 },
    { name: 'LinkedIn', size: 400 },
    { name: 'X', size: 400 },
    { name: 'WhatsApp', size: 500 },
    { name: 'Telegram', size: 512 },
    { name: 'Zoom', size: 512 },
  ];
  setOutputSize(v: number) {
    if (v >= 64 && v <= 2048) {
      this.outputSize.set(Math.round(v));
      this.renderPreview();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.previewUrl.set('');
    this.imgEl = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  download() {
    const canvas = this.buildCanvas(this.outputSize());
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      const dot = this.fileName().lastIndexOf('.');
      const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
      a.href = url;
      a.download = `${base}-profile.png`;
      this.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  private buildCanvas(size: number): HTMLCanvasElement | null {
    const img = this.imgEl;
    if (!img) return null;
    const canvas = this.document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const ring = Math.round((this.ringWidth() / 512) * size);
    const radius = size / 2 - ring;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.max(1, radius), 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    ctx.restore();
    if (ring > 0) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - ring / 2, 0, Math.PI * 2);
      ctx.lineWidth = ring;
      ctx.strokeStyle = this.ringColor();
      ctx.stroke();
    }
    return canvas;
  }

  private renderPreview() {
    const canvas = this.buildCanvas(512);
    if (!canvas) return;
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
    canvas.toBlob((blob) => {
      if (!blob) return;
      this.previewUrl.set(URL.createObjectURL(blob));
    }, 'image/png');
  }

  private loadFile(file: File) {
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    const img = new Image();
    img.onload = () => {
      this.imgEl = img;
      this.renderPreview();
    };
    img.onerror = () => this.error.set(this.t('labels.loadFailed'));
    img.src = this.objectUrl;
  }

  ngOnDestroy() {
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
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
