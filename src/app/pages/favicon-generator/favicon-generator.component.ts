import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SIZES = [16, 32, 48, 180, 192, 512];
const ICO_SIZES = [16, 32, 48];

interface Preview {
  size: number;
  url: string;
}

@Component({
  selector: 'app-favicon-generator',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './favicon-generator.component.html',
  styleUrl: './favicon-generator.component.scss',
})
export class FaviconGeneratorComponent implements OnDestroy {
  readonly slug = 'favicon-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-to-ico-converter', 'ico-editor', 'image-cropper', 'icon-to-png-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly mode = signal<'image' | 'text'>('image');
  readonly letter = signal('J');
  readonly bgColor = signal('#4f46e5');
  readonly fgColor = signal('#ffffff');
  readonly imgLoaded = signal(false);
  readonly previews = signal<Preview[]>([]);
  readonly icoUrl = signal<string | null>(null);
  readonly copied = signal(false);

  private img: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
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

  readonly snippet = computed(() => {
    this.translate.lang();
    return [
      '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    ].join('\n');
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

  setMode(m: 'image' | 'text'): void {
    this.mode.set(m);
    this.resetOutput();
  }
  setLetter(v: string): void {
    this.letter.set(v.slice(0, 2));
    this.resetOutput();
  }
  setBg(v: string): void {
    this.bgColor.set(v);
    this.resetOutput();
  }
  setFg(v: string): void {
    this.fgColor.set(v);
    this.resetOutput();
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMsg.set('');
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.typeError'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.errorMsg.set(this.t('labels.sizeError'));
      return;
    }
    this.clearImage();
    this.objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.imgLoaded.set(true);
      this.resetOutput();
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.typeError'));
      this.clearImage();
    };
    img.src = this.objectUrl;
  }

  async generate(): Promise<void> {
    this.errorMsg.set('');
    if (this.mode() === 'image' && !this.img) {
      this.errorMsg.set(this.t('labels.needImage'));
      return;
    }
    const previews: Preview[] = [];
    const pngs: { size: number; data: Uint8Array }[] = [];
    for (const size of SIZES) {
      const canvas = this.document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      this.paint(ctx, size);
      previews.push({ size, url: canvas.toDataURL('image/png') });
      if (ICO_SIZES.includes(size)) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) {
          const buf = await blob.arrayBuffer();
          pngs.push({ size, data: new Uint8Array(buf) });
        }
      }
    }
    this.previews.set(previews);
    const ico = this.buildIco(pngs);
    const old = this.icoUrl();
    if (old) URL.revokeObjectURL(old);
    this.icoUrl.set(URL.createObjectURL(new Blob([ico as unknown as BlobPart], { type: 'image/x-icon' })));
  }

  downloadPng(p: Preview): void {
    const name = p.size === 180 ? 'apple-touch-icon.png' : `favicon-${p.size}x${p.size}.png`;
    const a = this.document.createElement('a');
    a.href = p.url;
    a.download = name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  downloadIco(): void {
    const url = this.icoUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'favicon.ico';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async copySnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet()).catch(() => undefined);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.errorMsg.set(this.t('labels.copyError'));
    }
  }

  clearImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.img = null;
    this.imgLoaded.set(false);
    this.resetOutput();
  }

  ngOnDestroy() {
    this.clearImage();
    const old = this.icoUrl();
    if (old) URL.revokeObjectURL(old);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private resetOutput(): void {
    this.previews.set([]);
    const old = this.icoUrl();
    if (old) URL.revokeObjectURL(old);
    this.icoUrl.set(null);
    this.copied.set(false);
  }

  private paint(ctx: CanvasRenderingContext2D, size: number): void {
    if (this.mode() === 'text') {
      ctx.fillStyle = this.bgColor();
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = this.fgColor();
      ctx.font = `700 ${Math.round(size * 0.62)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.letter() || 'J', size / 2, size * 0.54);
      return;
    }
    const img = this.img;
    if (!img) return;
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }

  private buildIco(pngs: { size: number; data: Uint8Array }[]): Uint8Array {
    const headerLen = 6 + pngs.length * 16;
    let total = headerLen;
    for (const p of pngs) total += p.data.length;
    const buf = new Uint8Array(total);
    const view = new DataView(buf.buffer);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, pngs.length, true);
    let off = headerLen;
    pngs.forEach((p, i) => {
      const e = 6 + i * 16;
      buf[e] = p.size >= 256 ? 0 : p.size;
      buf[e + 1] = p.size >= 256 ? 0 : p.size;
      buf[e + 2] = 0;
      buf[e + 3] = 0;
      view.setUint16(e + 4, 1, true);
      view.setUint16(e + 6, 32, true);
      view.setUint32(e + 8, p.data.length, true);
      view.setUint32(e + 12, off, true);
      buf.set(p.data, off);
      off += p.data.length;
    });
    return buf;
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
