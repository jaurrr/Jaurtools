import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-brightness-contrast-adjuster',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './brightness-contrast-adjuster.component.html',
  styleUrl: './brightness-contrast-adjuster.component.scss',
})
export class BrightnessContrastAdjusterComponent implements OnDestroy {
  readonly slug = 'brightness-contrast-adjuster';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['grayscale-converter', 'film-grain-effect', 'photo-border-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly brightness = signal(0);
  readonly contrast = signal(0);
  readonly hasImage = signal(false);
  readonly fileError = signal('');

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

  setBrightness(v: number): void {
    this.brightness.set(this.clampNum(v, -100, 100));
    this.render();
  }

  setContrast(v: number): void {
    this.contrast.set(this.clampNum(v, -100, 100));
    this.render();
  }

  reset(): void {
    this.brightness.set(0);
    this.contrast.set(0);
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
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const b = this.brightness();
    const c = this.contrast();
    if (b === 0 && c === 0) return;
    const factor = 1 + c / 100;
    const offset = b * 2.55;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = this.clamp8((d[i] - 128) * factor + 128 + offset);
      d[i + 1] = this.clamp8((d[i + 1] - 128) * factor + 128 + offset);
      d[i + 2] = this.clamp8((d[i + 2] - 128) * factor + 128 + offset);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasImage()) return;
    const a = this.document.createElement('a');
    a.download = 'adjusted-image.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clamp8(v: number): number {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
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
