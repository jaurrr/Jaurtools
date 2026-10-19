import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALL_SIZES = [16, 32, 48, 64, 128, 256];

interface IcoEntry {
  size: number;
  bytes: number;
}

@Component({
  selector: 'app-image-to-ico-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-to-ico-converter.component.html',
  styleUrl: './image-to-ico-converter.component.scss',
})
export class ImageToIcoConverterComponent implements OnDestroy {
  readonly slug = 'image-to-ico-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['favicon-generator', 'ico-editor', 'icon-to-png-converter', 'image-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly imgW = signal(0);
  readonly imgH = signal(0);
  readonly sizes = signal<number[]>([16, 32, 48]);
  readonly converting = signal(false);
  readonly entries = signal<IcoEntry[]>([]);
  readonly icoUrl = signal<string | null>(null);
  readonly icoBytes = signal(0);

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

  readonly allSizes = ALL_SIZES;

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

  toggleSize(size: number): void {
    this.sizes.update((arr) => {
      if (arr.includes(size)) return arr.filter((s) => s !== size).sort((a, b) => a - b);
      return [...arr, size].sort((a, b) => a - b);
    });
    this.resetOutput();
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMsg.set('');
    if (file.size > MAX_FILE_BYTES) {
      this.errorMsg.set(this.t('labels.sizeError'));
      return;
    }
    this.clearImage();
    let url: string;
    let type = file.type;
    if (type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      type = 'image/svg+xml';
      url = URL.createObjectURL(new Blob([file], { type }));
    } else {
      url = URL.createObjectURL(file);
    }
    this.objectUrl = url;
    const img = new Image();
    img.onload = () => {
      if (type === 'image/svg+xml' && (!img.naturalWidth || !img.naturalHeight)) {
        this.errorMsg.set(this.t('labels.decodeError'));
        this.clearImage();
        return;
      }
      this.img = img;
      this.imgW.set(img.naturalWidth);
      this.imgH.set(img.naturalHeight);
      this.fileName.set(file.name);
      this.loaded.set(true);
    };
    img.onerror = () => {
      this.errorMsg.set(this.t('labels.decodeError'));
      this.clearImage();
    };
    img.src = url;
  }

  async convert(): Promise<void> {
    if (!this.img || this.converting()) return;
    const sizes = this.sizes();
    if (!sizes.length) {
      this.errorMsg.set(this.t('labels.needSizes'));
      return;
    }
    this.errorMsg.set('');
    this.converting.set(true);
    try {
      const pngs: { size: number; data: Uint8Array }[] = [];
      for (const size of sizes) {
        const canvas = this.document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const img = this.img as HTMLImageElement;
        const iw = img.naturalWidth || size;
        const ih = img.naturalHeight || size;
        const scale = Math.max(size / iw, size / ih);
        ctx.drawImage(img, (size - iw * scale) / 2, (size - ih * scale) / 2, iw * scale, ih * scale);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) continue;
        pngs.push({ size, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      if (!pngs.length) {
        this.errorMsg.set(this.t('labels.decodeError'));
        return;
      }
      const ico = this.buildIco(pngs);
      const old = this.icoUrl();
      if (old) URL.revokeObjectURL(old);
      this.icoUrl.set(URL.createObjectURL(new Blob([ico as unknown as BlobPart], { type: 'image/x-icon' })));
      this.icoBytes.set(ico.length);
      this.entries.set(pngs.map((p) => ({ size: p.size, bytes: p.data.length })));
    } finally {
      this.converting.set(false);
    }
  }

  download(): void {
    const url = this.icoUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'icon.ico';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  clearImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.img = null;
    this.loaded.set(false);
    this.fileName.set('');
    this.errorMsg.set('');
    this.resetOutput();
  }

  ngOnDestroy() {
    this.clearImage();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private resetOutput(): void {
    const old = this.icoUrl();
    if (old) URL.revokeObjectURL(old);
    this.icoUrl.set(null);
    this.entries.set([]);
    this.icoBytes.set(0);
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
