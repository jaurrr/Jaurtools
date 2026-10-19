import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-image-histogram',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-histogram.component.html',
  styleUrl: './image-histogram.component.scss',
})
export class ImageHistogramComponent implements OnDestroy {
  readonly slug = 'image-histogram';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-color-extractor', 'photo-filters'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly analyzing = signal(false);
  readonly analyzed = signal(false);
  readonly mode = signal<'luma' | 'rgb'>('luma');
  readonly meanBrightness = signal(0);
  readonly darkestPct = signal(0);
  readonly brightestPct = signal(0);
  readonly reading = computed(() => {
    const m = this.meanBrightness();
    if (m < 64) return 'dark';
    if (m > 192) return 'bright';
    return 'balanced';
  });
  readonly readingLabel = computed(() => this.t(`labels.reading${this.reading()[0].toUpperCase()}${this.reading().slice(1)}`));

  private bins = { luma: new Array<number>(256).fill(0), r: new Array<number>(256).fill(0), g: new Array<number>(256).fill(0), b: new Array<number>(256).fill(0) };
  private total = 0;
  private objectUrl: string | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasResults = computed(() => this.analyzed());
  readonly modes = computed(() => [
    { value: 'luma', label: this.t('labels.modeLuma') },
    { value: 'rgb', label: this.t('labels.modeRgb') },
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

  setMode(m: string) {
    if (m === 'luma' || m === 'rgb') {
      this.mode.set(m);
      this.draw();
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
    this.analyzed.set(false);
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
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
    this.analyzing.set(true);
    this.analyzed.set(false);
    const img = new Image();
    img.onload = () => {
      try {
        this.compute(img);
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

  private compute(img: HTMLImageElement) {
    const MAX = 200;
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
    this.bins = { luma: new Array<number>(256).fill(0), r: new Array<number>(256).fill(0), g: new Array<number>(256).fill(0), b: new Array<number>(256).fill(0) };
    this.total = w * h;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      this.bins.luma[luma]++;
      this.bins.r[r]++;
      this.bins.g[g]++;
      this.bins.b[b]++;
      sum += luma;
    }
    const mean = sum / this.total;
    this.meanBrightness.set(Math.round(mean * 10) / 10);
    const dark = this.bins.luma.slice(0, 16).reduce((a, b2) => a + b2, 0);
    const bright = this.bins.luma.slice(240).reduce((a, b2) => a + b2, 0);
    this.darkestPct.set(Math.round((dark / this.total) * 1000) / 10);
    this.brightestPct.set(Math.round((bright / this.total) * 1000) / 10);
    this.analyzed.set(true);
    setTimeout(() => this.draw(), 0);
  }

  private draw() {
    const canvas = this.document.getElementById('ih-canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.analyzed()) return;
    const W = 512;
    const H = 220;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dark = this.document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = dark ? '#334155' : '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, H - 24);
    ctx.lineTo(W, H - 24);
    ctx.stroke();
    const barW = W / 256;
    const series =
      this.mode() === 'luma'
        ? [{ bins: this.bins.luma, color: dark ? '#a5b4fc' : '#4f46e5' }]
        : [
            { bins: this.bins.r, color: 'rgba(239, 68, 68, 0.7)' },
            { bins: this.bins.g, color: 'rgba(34, 197, 94, 0.7)' },
            { bins: this.bins.b, color: 'rgba(59, 130, 246, 0.7)' },
          ];
    const peak = Math.max(1, ...series.flatMap((s) => s.bins));
    const plotH = H - 30;
    for (const s of series) {
      ctx.fillStyle = s.color;
      for (let i = 0; i < 256; i++) {
        const bh = (s.bins[i] / peak) * plotH;
        if (bh > 0) ctx.fillRect(i * barW, plotH - bh, barW, bh);
      }
    }
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText('0', 2, H - 8);
    ctx.fillText('128', W / 2 - 10, H - 8);
    ctx.fillText('255', W - 24, H - 8);
  }

  ngOnDestroy() {
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
