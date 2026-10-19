import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface ColorSwatch {
  hex: string;
  rgb: string;
  count: number;
  pct: number;
}

@Component({
  selector: 'app-image-color-extractor',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-color-extractor.component.html',
  styleUrl: './image-color-extractor.component.scss',
})
export class ImageColorExtractorComponent implements OnDestroy {
  readonly slug = 'image-color-extractor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-color-extractor', 'image-color-picker', 'image-histogram'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly analyzing = signal(false);
  readonly analyzed = signal(false);
  readonly uniqueColors = signal(0);
  readonly totalPixels = signal(0);
  readonly maxSwatches = signal(48);
  readonly swatches = signal<ColorSwatch[]>([]);
  readonly copiedKey = signal('');

  private objectUrl: string | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly shown = computed(() => this.swatches().slice(0, Math.max(12, this.maxSwatches())));
  readonly hasResults = computed(() => this.analyzed() && this.swatches().length > 0);

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

  setMaxSwatches(v: number) {
    this.maxSwatches.set(this.clampNum(v, 12, 96));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.analyzed.set(false);
    this.swatches.set([]);
    this.uniqueColors.set(0);
    this.totalPixels.set(0);
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  copyHex(hex: string) {
    this.copyText(hex, hex);
  }

  copyPalette() {
    const text = this.shown()
      .map((s) => s.hex)
      .join(', ');
    this.copyText(text, 'palette');
  }

  private copyText(text: string, key: string) {
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedKey.set(key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(''), 2000);
    }).catch(() => undefined);
  }

  private loadFile(file: File) {
    this.error.set('');
    this.copiedKey.set('');
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
    this.analyzing.set(true);
    this.analyzed.set(false);
    const img = new Image();
    img.onload = () => {
      try {
        this.extract(img);
      } catch {
        this.error.set(this.t('labels.loadFailed'));
      }
      this.analyzing.set(false);
    };
    img.onerror = () => {
      this.error.set(this.t('labels.loadFailed'));
      this.analyzing.set(false);
    };
    img.src = this.objectUrl;
  }

  private extract(img: HTMLImageElement) {
    const MAX = 160;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = this.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.error.set(this.t('labels.loadFailed'));
      return;
    }
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = w * h;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    this.uniqueColors.set(sorted.length);
    this.totalPixels.set(total);
    this.swatches.set(
      sorted.slice(0, 96).map(([key, count]) => {
        const r = ((key >> 8) & 0xf) * 17;
        const g = ((key >> 4) & 0xf) * 17;
        const b = (key & 0xf) * 17;
        const hex =
          '#' +
          [r, g, b]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        return {
          hex,
          rgb: `rgb(${r}, ${g}, ${b})`,
          count,
          pct: Math.round((count / total) * 1000) / 10,
        };
      })
    );
    this.analyzed.set(true);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
