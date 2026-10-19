import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-svg-to-png-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './svg-to-png-converter.component.html',
  styleUrl: './svg-to-png-converter.component.scss',
})
export class SvgToPngConverterComponent implements OnDestroy {
  readonly slug = 'svg-to-png-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['svg-rasterizer', 'svg-converter', 'svg-optimizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly svgText = signal('');
  readonly fileName = signal('');
  readonly srcW = signal(0);
  readonly srcH = signal(0);
  readonly targetW = signal(1024);
  readonly targetH = signal(1024);
  readonly lockAspect = signal(true);
  readonly background = signal<'transparent' | 'white' | 'black'>('transparent');
  readonly pngUrl = signal('');
  readonly error = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasSvg = computed(() => this.svgText().length > 0 && this.srcW() > 0 && this.srcH() > 0);

  readonly pixelCount = computed(() => this.targetW() * this.targetH());

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
    if (file.size > 10 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSize'));
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      this.parseSvg(text, file.name);
    };
    reader.onerror = () => this.error.set(this.t('labels.errorRead'));
    reader.readAsText(file);
    input.value = '';
  }

  private parseSvg(text: string, name: string) {
    const src = text.trim();
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    } catch {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
      this.error.set(this.t('labels.errorInvalid'));
      return;
    }
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
    const baseW = Number.isFinite(w) && w > 0 ? w : vw > 0 ? vw : 0;
    const baseH = Number.isFinite(h) && h > 0 ? h : vh > 0 ? vh : 0;
    if (!(baseW > 0 && baseH > 0)) {
      this.error.set(this.t('labels.errorNoDims'));
      return;
    }
    this.svgText.set(src);
    this.fileName.set(name);
    this.srcW.set(Math.round(baseW));
    this.srcH.set(Math.round(baseH));
    this.pngUrl.set('');
    this.setTargetW(Math.min(1024, Math.round(baseW * 4)));
  }

  setTargetW(v: number) {
    const val = Math.round(this.clampNum(v, 16, 8000));
    this.targetW.set(val);
    this.pngUrl.set('');
    if (this.lockAspect() && this.srcW() > 0 && this.srcH() > 0) {
      this.targetH.set(Math.max(16, Math.round((val * this.srcH()) / this.srcW())));
    }
  }

  setTargetH(v: number) {
    const val = Math.round(this.clampNum(v, 16, 8000));
    this.targetH.set(val);
    this.pngUrl.set('');
    if (this.lockAspect() && this.srcW() > 0 && this.srcH() > 0) {
      this.targetW.set(Math.max(16, Math.round((val * this.srcW()) / this.srcH())));
    }
  }

  setLockAspect(v: boolean) {
    this.lockAspect.set(v);
    this.pngUrl.set('');
  }

  setBackground(b: 'transparent' | 'white' | 'black') {
    this.background.set(b);
    this.pngUrl.set('');
  }

  convert() {
    this.error.set('');
    if (!this.hasSvg()) return;
    const w = this.targetW();
    const h = this.targetH();
    const doc = new DOMParser().parseFromString(this.svgText(), 'image/svg+xml');
    const el = doc.documentElement;
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    const svgText = new XMLSerializer().serializeToString(el);
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (this.background() !== 'transparent') {
          ctx.fillStyle = this.background() === 'white' ? '#ffffff' : '#000000';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        this.pngUrl.set(canvas.toDataURL('image/png'));
      } else {
        this.error.set(this.t('labels.errorCanvas'));
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.error.set(this.t('labels.errorRender'));
    };
    img.src = url;
  }

  downloadPng() {
    const url = this.pngUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    const base = this.fileName().replace(/\.svg$/i, '') || 'image';
    a.download = `${base}-${this.targetW()}x${this.targetH()}.png`;
    a.click();
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
