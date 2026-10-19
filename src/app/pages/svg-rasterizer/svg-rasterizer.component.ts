import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-svg-rasterizer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-rasterizer.component.html',
  styleUrl: './svg-rasterizer.component.scss',
})
export class SvgRasterizerComponent implements OnDestroy {
  readonly slug = 'svg-rasterizer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-to-png-converter', 'svg-converter', 'svg-optimizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly svgInput = signal(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40" fill="#4f46e5"/>\n</svg>'
  );
  readonly scale = signal(4);
  readonly background = signal<'transparent' | 'white' | 'black'>('transparent');
  readonly pngUrl = signal('');
  readonly dims = signal({ w: 0, h: 0 });
  readonly error = signal('');
  readonly rendering = signal(false);

  private debounceId: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const code = this.svgInput();
      const sc = this.scale();
      const bg = this.background();
      if (this.debounceId) clearTimeout(this.debounceId);
      this.debounceId = setTimeout(() => this.render(code, sc, bg), 350);
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

  setSvgInput(v: string) {
    this.svgInput.set(v);
    this.error.set('');
  }

  setScale(v: number) {
    this.scale.set(Math.round(this.clampNum(v, 1, 8)));
  }

  setBackground(b: 'transparent' | 'white' | 'black') {
    this.background.set(b);
  }

  private render(code: string, scale: number, bg: string) {
    const src = code.trim();
    if (!src) {
      this.pngUrl.set('');
      return;
    }
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    } catch {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
      this.error.set(this.t('labels.errorInvalid'));
      this.pngUrl.set('');
      return;
    }
    this.rendering.set(true);
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
    const baseW = Number.isFinite(w) && w > 0 ? w : vw > 0 ? vw : 300;
    const baseH = Number.isFinite(h) && h > 0 ? h : vh > 0 ? vh : 300;
    const out = el.cloneNode(true) as Element;
    out.setAttribute('width', String(baseW * scale));
    out.setAttribute('height', String(baseH * scale));
    const svgText = new XMLSerializer().serializeToString(out);
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = this.document.createElement('canvas');
      canvas.width = baseW * scale;
      canvas.height = baseH * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (bg !== 'transparent') {
          ctx.fillStyle = bg === 'white' ? '#ffffff' : '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.pngUrl.set(canvas.toDataURL('image/png'));
        this.dims.set({ w: canvas.width, h: canvas.height });
        this.error.set('');
      }
      URL.revokeObjectURL(url);
      this.rendering.set(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.error.set(this.t('labels.errorRender'));
      this.pngUrl.set('');
      this.rendering.set(false);
    };
    img.src = url;
  }

  downloadPng() {
    const url = this.pngUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `rasterized-${this.scale()}x.png`;
    a.click();
  }

  ngOnDestroy() {
    if (this.debounceId) clearTimeout(this.debounceId);
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
