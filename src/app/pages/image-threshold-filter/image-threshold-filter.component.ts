import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-image-threshold-filter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-threshold-filter.component.html',
  styleUrl: './image-threshold-filter.component.scss',
})
export class ImageThresholdFilterComponent implements OnDestroy {
  readonly slug = 'image-threshold-filter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['tilt-shift-effect', 'exif-viewer', 'svg-to-png-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly srcUrl = signal('');
  readonly outUrl = signal('');
  readonly threshold = signal(128);
  readonly invert = signal(false);
  readonly error = signal('');
  readonly dims = signal({ w: 0, h: 0 });

  private sourceImg: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.srcUrl().length > 0);

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

  loadFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.errorType'));
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSize'));
      input.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.sourceImg = img;
      this.srcUrl.set(url);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      this.dims.set({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      });
      this.process();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.error.set(this.t('labels.errorRead'));
    };
    img.src = url;
    input.value = '';
  }

  setThreshold(v: number) {
    this.threshold.set(Math.round(this.clampNum(v, 0, 255)));
    this.process();
  }

  setInvert(v: boolean) {
    this.invert.set(v);
    this.process();
  }

  private process() {
    const img = this.sourceImg;
    if (!img) return;
    const { w, h } = this.dims();
    const canvas = this.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const t = this.threshold();
    const inv = this.invert();
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      let out = lum >= t ? 255 : 0;
      if (inv) out = 255 - out;
      px[i] = out;
      px[i + 1] = out;
      px[i + 2] = out;
    }
    ctx.putImageData(data, 0, 0);
    this.outUrl.set(canvas.toDataURL('image/png'));
  }

  download() {
    const url = this.outUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `threshold-${this.threshold()}.png`;
    a.click();
  }

  ngOnDestroy() {
    if (this.srcUrl()) URL.revokeObjectURL(this.srcUrl());
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
