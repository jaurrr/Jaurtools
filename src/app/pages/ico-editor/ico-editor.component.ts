import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface IcoLayer {
  id: number;
  size: number;
  bpp: number;
  bytes: number;
  format: 'PNG' | 'BMP' | '?';
  url: string;
  selected: boolean;
}

@Component({
  selector: 'app-ico-editor',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './ico-editor.component.html',
  styleUrl: './ico-editor.component.scss',
})
export class IcoEditorComponent implements OnDestroy {
  readonly slug = 'ico-editor';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-to-ico-converter', 'favicon-generator', 'icon-to-png-converter', 'image-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly errorMsg = signal('');
  readonly loaded = signal(false);
  readonly fileName = signal('');
  readonly layers = signal<IcoLayer[]>([]);
  readonly rebuiltUrl = signal<string | null>(null);
  readonly rebuilding = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly selectedCount = computed(() => this.layers().filter((l) => l.selected).length);

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

  layerLabel(id: number): string {
    return `${this.t('labels.layerLabel')} ${id + 1}`;
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
    this.clearAll();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const layers = this.parseIco(reader.result as ArrayBuffer);
        if (!layers.length) {
          this.errorMsg.set(this.t('labels.parseError'));
          return;
        }
        this.layers.set(layers);
        this.fileName.set(file.name);
        this.loaded.set(true);
      } catch {
        this.errorMsg.set(this.t('labels.parseError'));
      }
    };
    reader.onerror = () => this.errorMsg.set(this.t('labels.typeError'));
    reader.readAsArrayBuffer(file);
  }

  toggleLayer(id: number): void {
    this.layers.update((arr) => arr.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
    this.clearRebuilt();
  }

  downloadLayer(layer: IcoLayer): void {
    const a = this.document.createElement('a');
    a.href = layer.url;
    a.download = `icon-layer-${layer.size}x${layer.size}.png`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async rebuild(): Promise<void> {
    const selected = this.layers().filter((l) => l.selected && l.format !== '?');
    if (!selected.length || this.rebuilding()) return;
    this.rebuilding.set(true);
    try {
      const pngs: { size: number; data: Uint8Array }[] = [];
      for (const layer of selected) {
        const img = await this.loadImage(layer.url);
        const canvas = this.document.createElement('canvas');
        canvas.width = layer.size;
        canvas.height = layer.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0, layer.size, layer.size);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) continue;
        pngs.push({ size: layer.size, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      if (!pngs.length) return;
      const ico = this.buildIco(pngs);
      this.clearRebuilt();
      this.rebuiltUrl.set(URL.createObjectURL(new Blob([ico as unknown as BlobPart], { type: 'image/x-icon' })));
    } finally {
      this.rebuilding.set(false);
    }
  }

  downloadRebuilt(): void {
    const url = this.rebuiltUrl();
    if (!url) return;
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'icon-rebuilt.ico';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  clearAll(): void {
    for (const l of this.layers()) URL.revokeObjectURL(l.url);
    this.layers.set([]);
    this.loaded.set(false);
    this.fileName.set('');
    this.errorMsg.set('');
    this.clearRebuilt();
  }

  ngOnDestroy() {
    this.clearAll();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private clearRebuilt(): void {
    const old = this.rebuiltUrl();
    if (old) URL.revokeObjectURL(old);
    this.rebuiltUrl.set(null);
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('img'));
      img.src = url;
    });
  }

  private parseIco(buffer: ArrayBuffer): IcoLayer[] {
    const view = new DataView(buffer);
    if (view.byteLength < 6) throw new Error('short');
    if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) throw new Error('not-ico');
    const count = view.getUint16(4, true);
    if (count === 0 || count > 64) throw new Error('count');
    const layers: IcoLayer[] = [];
    for (let i = 0; i < count; i++) {
      const e = 6 + i * 16;
      if (e + 16 > view.byteLength) break;
      const w = view.getUint8(e) || 256;
      const h = view.getUint8(e + 1) || 256;
      const bpp = view.getUint16(e + 6, true);
      const bytes = view.getUint32(e + 8, true);
      const dataOff = view.getUint32(e + 12, true);
      if (dataOff + bytes > view.byteLength || bytes === 0) continue;
      const slice = new Uint8Array(buffer.slice(dataOff, dataOff + bytes));
      const isPng =
        slice.length > 8 &&
        slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47;
      let url = '';
      let format: IcoLayer['format'] = '?';
      if (isPng) {
        url = URL.createObjectURL(new Blob([slice as unknown as BlobPart], { type: 'image/png' }));
        format = 'PNG';
      } else {
        const bmpUrl = this.decodeBmp(slice, w, h);
        if (bmpUrl) {
          url = bmpUrl;
          format = 'BMP';
        }
      }
      if (!url) continue;
      layers.push({ id: i, size: Math.min(w, h), bpp, bytes, format, url, selected: true });
    }
    return layers;
  }

  private decodeBmp(slice: Uint8Array, entryW: number, entryH: number): string | null {
    try {
      const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      if (slice.byteLength < 40) return null;
      const biSize = view.getUint32(0, true);
      const biWidth = view.getInt32(4, true);
      const biHeight = view.getInt32(8, true);
      const biBitCount = view.getUint16(14, true);
      if (biBitCount !== 24 && biBitCount !== 32) return null;
      if (biWidth <= 0) return null;
      const imgH = Math.abs(biHeight) / 2;
      if (imgH <= 0 || imgH > 1024 || biWidth > 1024) return null;
      const bottomUp = biHeight > 0;
      const stride = ((biWidth * biBitCount + 31) >> 5) * 4;
      const dataOff = biSize;
      const canvas = this.document.createElement('canvas');
      canvas.width = biWidth;
      canvas.height = imgH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const out = ctx.createImageData(biWidth, imgH);
      const bytesPerPx = biBitCount / 8;
      for (let y = 0; y < imgH; y++) {
        const srcY = bottomUp ? imgH - 1 - y : y;
        for (let x = 0; x < biWidth; x++) {
          const sp = dataOff + srcY * stride + x * bytesPerPx;
          if (sp + bytesPerPx > slice.length) break;
          const dp = (y * biWidth + x) * 4;
          out.data[dp] = slice[sp + 2];
          out.data[dp + 1] = slice[sp + 1];
          out.data[dp + 2] = slice[sp];
          out.data[dp + 3] = bytesPerPx === 4 ? slice[sp + 3] : 255;
        }
      }
      void entryW;
      void entryH;
      ctx.putImageData(out, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
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
