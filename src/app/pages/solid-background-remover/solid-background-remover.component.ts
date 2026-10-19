import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type BgMode = 'transparent' | 'white' | 'custom';
type KeyMode = 'flood' | 'chroma';

@Component({
  selector: 'app-solid-background-remover',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './solid-background-remover.component.html',
  styleUrl: './solid-background-remover.component.scss',
})
export class SolidBackgroundRemoverComponent implements OnDestroy {
  readonly slug = 'solid-background-remover';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-overlay', 'merge-images', 'round-corners', 'image-resizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly targetColor = signal('#ffffff');
  readonly tolerance = signal(30);
  readonly keyMode = signal<KeyMode>('flood');
  readonly feather = signal(2);
  readonly bgMode = signal<BgMode>('transparent');
  readonly customColor = signal('#4f46e5');
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly errorMsg = signal('');
  readonly removedPct = signal(0);

  readonly keyModes: KeyMode[] = ['flood', 'chroma'];
  readonly hasOutput = computed(() => this.image() !== null);

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('bgCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private objectUrls: string[] = [];
  private orig: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      this.render();
    });
  }

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

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMsg.set(this.t('labels.invalidType'));
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.fileTooLarge'));
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    const url = URL.createObjectURL(file);
    this.objectUrls.push(url);
    const img = new Image();
    img.onload = () => {
      this.orig = null;
      this.image.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    };
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setTargetColor(c: string): void { this.targetColor.set(c); }
  setTolerance(v: number): void { this.tolerance.set(this.clampNum(v, 0, 100)); }
  setKeyMode(m: KeyMode): void { this.keyMode.set(m); }
  setFeather(v: number): void { this.feather.set(this.clampNum(v, 0, 10)); }
  setBgMode(m: BgMode): void { this.bgMode.set(m); }
  setCustomColor(c: string): void { this.customColor.set(c); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  sampleColor(event: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    const orig = this.orig;
    if (!canvas || !orig) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * orig.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * orig.height);
    if (x < 0 || y < 0 || x >= orig.width || y >= orig.height) return;
    const i = (y * orig.width + x) * 4;
    const hex = '#' + [orig.data[i], orig.data[i + 1], orig.data[i + 2]]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
    this.targetColor.set(hex);
  }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const flat = this.document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fctx = flat.getContext('2d');
    if (!fctx) return;
    if (this.format() === 'jpeg' || this.bgMode() !== 'transparent') {
      fctx.fillStyle = this.bgMode() === 'custom' ? this.customColor() : '#ffffff';
      fctx.fillRect(0, 0, flat.width, flat.height);
    }
    fctx.drawImage(canvas, 0, 0);
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = flat.toDataURL(mime, 0.92);
    a.download = `background-removed.${this.format() === 'png' ? 'png' : 'jpg'}`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    const im = this.image();
    if (!canvas || !im) return;
    canvas.width = im.width;
    canvas.height = im.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(im.img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.orig = { data: new Uint8ClampedArray(imgData.data), width: canvas.width, height: canvas.height };
    const px = imgData.data;
    const [tr, tg, tb] = this.hexToRgb(this.targetColor());
    const tol = (this.tolerance() / 100) * 200;
    const feather = this.feather();
    const w = canvas.width;
    const h = canvas.height;
    const dist = (i: number): number => {
      const dr = px[i] - tr, dg = px[i + 1] - tg, db = px[i + 2] - tb;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    const alphaFor = (d: number): number => {
      if (d <= tol) return 0;
      if (feather <= 0 || d >= tol + feather * 8) return 1;
      return (d - tol) / (feather * 8);
    };
    let removed = 0;
    if (this.keyMode() === 'chroma') {
      for (let i = 0; i < px.length; i += 4) {
        const a = alphaFor(dist(i));
        px[i + 3] = Math.round(a * 255);
        if (a === 0) removed++;
      }
    } else {
      const inside = new Uint8Array(w * h);
      const stack: number[] = [];
      const trySeed = (x: number, y: number): void => {
        const p = y * w + x;
        if (!inside[p] && dist(p * 4) <= tol) {
          inside[p] = 1;
          stack.push(p);
        }
      };
      for (let x = 0; x < w; x++) { trySeed(x, 0); trySeed(x, h - 1); }
      for (let y = 0; y < h; y++) { trySeed(0, y); trySeed(w - 1, y); }
      while (stack.length) {
        const p = stack.pop() as number;
        const x = p % w;
        const y = (p / w) | 0;
        if (x > 0) {
          const q = p - 1;
          if (!inside[q] && dist(q * 4) <= tol) { inside[q] = 1; stack.push(q); }
        }
        if (x < w - 1) {
          const q = p + 1;
          if (!inside[q] && dist(q * 4) <= tol) { inside[q] = 1; stack.push(q); }
        }
        if (y > 0) {
          const q = p - w;
          if (!inside[q] && dist(q * 4) <= tol) { inside[q] = 1; stack.push(q); }
        }
        if (y < h - 1) {
          const q = p + w;
          if (!inside[q] && dist(q * 4) <= tol) { inside[q] = 1; stack.push(q); }
        }
      }
      for (let p = 0; p < w * h; p++) {
        if (inside[p]) {
          px[p * 4 + 3] = 0;
          removed++;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this.removedPct.set(Math.round((removed / (w * h)) * 1000) / 10);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  }

  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
