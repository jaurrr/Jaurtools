import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-tilt-shift-effect',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './tilt-shift-effect.component.html',
  styleUrl: './tilt-shift-effect.component.scss',
})
export class TiltShiftEffectComponent implements OnDestroy {
  readonly slug = 'tilt-shift-effect';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-threshold-filter', 'exif-viewer', 'text-to-image-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly srcUrl = signal('');
  readonly outUrl = signal('');
  readonly focusY = signal(60);
  readonly bandH = signal(30);
  readonly blur = signal(8);
  readonly feather = signal(25);
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

  setFocusY(v: number) { this.focusY.set(this.clampNum(v, 0, 100)); this.process(); }
  setBandH(v: number) { this.bandH.set(this.clampNum(v, 5, 80)); this.process(); }
  setBlur(v: number) { this.blur.set(this.clampNum(v, 0, 30)); this.process(); }
  setFeather(v: number) { this.feather.set(this.clampNum(v, 0, 60)); this.process(); }

  private makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = this.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  private process() {
    const img = this.sourceImg;
    if (!img) return;
    const { w, h } = this.dims();
    const bandTop = (this.focusY() / 100) * h - ((this.bandH() / 100) * h) / 2;
    const bandBottom = (this.focusY() / 100) * h + ((this.bandH() / 100) * h) / 2;
    const featherPx = (this.feather() / 100) * h;

    const blurred = this.makeCanvas(w, h);
    const bctx = blurred.getContext('2d');
    if (!bctx) return;
    bctx.filter = `blur(${this.blur()}px)`;
    bctx.drawImage(img, 0, 0, w, h);

    const result = this.makeCanvas(w, h);
    const rctx = result.getContext('2d');
    if (!rctx) return;
    rctx.drawImage(img, 0, 0, w, h);

    const overlay = (y0: number, y1: number, top: boolean) => {
      const strip = this.makeCanvas(w, h);
      const sctx = strip.getContext('2d');
      if (!sctx) return;
      sctx.drawImage(blurred, 0, 0);
      const grad = sctx.createLinearGradient(0, y0, 0, y1);
      if (top) {
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
      }
      sctx.globalCompositeOperation = 'destination-in';
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, w, h);
      rctx.drawImage(strip, 0, 0);
    };

    overlay(0, Math.max(1, bandTop + featherPx), true);
    overlay(Math.min(h - 1, bandBottom - featherPx), h, false);

    this.outUrl.set(result.toDataURL('image/png'));
  }

  download() {
    const url = this.outUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'tilt-shift.png';
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
