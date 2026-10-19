import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-svg-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-converter.component.html',
  styleUrl: './svg-converter.component.scss',
})
export class SvgConverterComponent implements OnDestroy {
  readonly slug = 'svg-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-to-png-converter', 'svg-rasterizer', 'svg-optimizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly mode = signal<'toRaster' | 'toSvg'>('toRaster');
  readonly svgInput = signal(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40" fill="#4f46e5"/>\n</svg>'
  );
  readonly scale = signal(4);
  readonly background = signal<'transparent' | 'white' | 'black'>('transparent');
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly rasterUrl = signal('');
  readonly rasterSize = signal({ w: 0, h: 0 });
  readonly error = signal('');
  readonly rasterName = signal('');
  readonly rasterDataUrl = signal('');
  readonly rasterW = signal(0);
  readonly rasterH = signal(0);
  readonly svgName = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly svgValid = computed(() => {
    const src = this.svgInput().trim();
    if (!src) return false;
    try {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      return doc.querySelector('parsererror') === null && doc.documentElement.nodeName.toLowerCase() === 'svg';
    } catch {
      return false;
    }
  });

  readonly svgPreview = computed((): SafeHtml =>
    this.svgValid() ? this.sanitizer.bypassSecurityTrustHtml(this.svgInput()) : ''
  );

  readonly wrappedSvg = computed((): string => {
    const src = this.svgInput().trim();
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const el = doc.documentElement;
    const w = parseFloat(el.getAttribute('width') || '');
    const h = parseFloat(el.getAttribute('height') || '');
    let vw = 0;
    let vh = 0;
    const vb = el.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        vw = parts[2];
        vh = parts[3];
      }
    }
    const out = el.cloneNode(true) as Element;
    const finalW = Number.isFinite(w) && w > 0 ? w : vw > 0 ? vw : 300;
    const finalH = Number.isFinite(h) && h > 0 ? h : vh > 0 ? vh : 300;
    out.setAttribute('width', String(finalW * this.scale()));
    out.setAttribute('height', String(finalH * this.scale()));
    return new XMLSerializer().serializeToString(out);
  });

  readonly embedSvg = computed(() => {
    const data = this.rasterDataUrl();
    if (!data) return '';
    const w = this.rasterW();
    const h = this.rasterH();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <image href="${data}" width="${w}" height="${h}"/>\n</svg>`;
  });

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

  setMode(m: 'toRaster' | 'toSvg') {
    this.mode.set(m);
    this.error.set('');
  }

  setSvgInput(v: string) {
    this.svgInput.set(v);
    this.error.set('');
    this.rasterUrl.set('');
  }

  setScale(v: number) {
    this.scale.set(Math.round(this.clampNum(v, 1, 8)));
  }

  setBackground(b: 'transparent' | 'white' | 'black') {
    this.background.set(b);
  }

  setFormat(f: 'png' | 'jpeg') {
    this.format.set(f);
  }

  loadSvgFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSvgSize'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.setSvgInput(String(reader.result ?? ''));
    };
    reader.onerror = () => this.error.set(this.t('labels.errorRead'));
    reader.readAsText(file);
    input.value = '';
  }

  convertToRaster() {
    this.error.set('');
    if (!this.svgValid()) {
      this.error.set(this.t('labels.errorInvalidSvg'));
      return;
    }
    const svgText = this.wrappedSvg();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 300;
      const h = img.naturalHeight || 300;
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.error.set(this.t('labels.errorCanvas'));
        URL.revokeObjectURL(url);
        return;
      }
      if (this.background() !== 'transparent') {
        ctx.fillStyle = this.background() === 'white' ? '#ffffff' : '#000000';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
      this.rasterUrl.set(canvas.toDataURL(mime, 0.92));
      this.rasterSize.set({ w, h });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.error.set(this.t('labels.errorRender'));
    };
    img.src = url;
  }

  loadRasterFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.errorType'));
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSize'));
      input.value = '';
      return;
    }
    this.rasterName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? '');
      const img = new Image();
      img.onload = () => {
        this.rasterDataUrl.set(data);
        this.rasterW.set(img.naturalWidth);
        this.rasterH.set(img.naturalHeight);
        this.error.set('');
      };
      img.onerror = () => this.error.set(this.t('labels.errorRead'));
      img.src = data;
    };
    reader.onerror = () => this.error.set(this.t('labels.errorRead'));
    reader.readAsDataURL(file);
    input.value = '';
  }

  downloadRaster() {
    const url = this.rasterUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `converted.${this.format() === 'png' ? 'png' : 'jpg'}`;
    a.click();
  }

  downloadEmbed() {
    const code = this.embedSvg();
    if (!code) return;
    const url = URL.createObjectURL(new Blob([code], { type: 'image/svg+xml' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'embedded.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnDestroy() {
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
