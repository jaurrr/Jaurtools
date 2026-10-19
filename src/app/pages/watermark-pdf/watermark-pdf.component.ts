import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_IMG_BYTES = 10 * 1024 * 1024;

type WmKind = 'text' | 'image';
type WmPos = 'center' | 'diagonal' | 'tiled' | 'corners';

const COLORS: Record<string, [number, number, number]> = {
  gray: [0.45, 0.45, 0.45],
  red: [0.78, 0.16, 0.16],
  blue: [0.2, 0.32, 0.78],
  black: [0.1, 0.1, 0.1],
};

@Component({
  selector: 'app-watermark-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './watermark-pdf.component.html',
  styleUrl: './watermark-pdf.component.scss',
})
export class WatermarkPdfComponent implements OnDestroy {
  readonly slug = 'watermark-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sign-pdf', 'redact-pdf', 'rotate-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly kind = signal<WmKind>('text');
  readonly pos = signal<WmPos>('diagonal');
  readonly wmText = signal('CONFIDENTIAL');
  readonly fontSize = signal(72);
  readonly opacity = signal(18);
  readonly angle = signal(45);
  readonly color = signal('gray');
  readonly imgName = signal('');
  readonly fileName = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');

  private pdfBytes: Uint8Array | null = null;
  private imgBytes: Uint8Array | null = null;
  private imgType: 'png' | 'jpg' = 'png';
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

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  setKind(k: WmKind): void {
    this.kind.set(k);
    this.error.set('');
  }
  setPos(p: WmPos): void {
    this.pos.set(p);
  }
  setWmText(v: string): void {
    this.wmText.set(v);
  }
  setFontSize(v: number): void {
    this.fontSize.set(Math.min(140, Math.max(16, Math.round(v))));
  }
  setOpacity(v: number): void {
    this.opacity.set(Math.min(80, Math.max(5, Math.round(v))));
  }
  setAngle(v: number): void {
    this.angle.set(Math.min(90, Math.max(0, Math.round(v))));
  }
  setColor(v: string): void {
    this.color.set(v);
  }

  async onPdfSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.status.set('');
    if (!this.isPdf(file)) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await PDFDocument.load(data, { ignoreEncryption: true });
      this.pdfBytes = data;
      this.fileName.set(file.name);
    } catch {
      this.error.set(this.t('labels.errParse'));
      this.pdfBytes = null;
    }
  }

  async onImageSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    const isPng = file.type === 'image/png';
    const isJpg = file.type === 'image/jpeg';
    if (!isPng && !isJpg) {
      this.error.set(this.t('labels.errImgType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_IMG_BYTES) {
      this.error.set(this.t('labels.errImgSize'));
      input.value = '';
      return;
    }
    this.imgBytes = new Uint8Array(await file.arrayBuffer());
    this.imgType = isPng ? 'png' : 'jpg';
    this.imgName.set(file.name);
  }

  async apply(): Promise<void> {
    if (!this.pdfBytes || this.busy()) return;
    if (this.kind() === 'text' && !this.wmText().trim()) {
      this.error.set(this.t('labels.errNoText'));
      return;
    }
    if (this.kind() === 'image' && !this.imgBytes) {
      this.error.set(this.t('labels.errNoImage'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      const op = this.opacity() / 100;
      const pos = this.pos();

      if (this.kind() === 'text') {
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const text = this.wmText().trim();
        const size = this.fontSize();
        const [r, g, b] = COLORS[this.color()] ?? COLORS['gray'];
        const textW = font.widthOfTextAtSize(text, size);
        for (let i = 0; i < doc.getPageCount(); i++) {
          const page = doc.getPage(i);
          const { width, height } = page.getSize();
          for (const p of this.textPositions(pos, width, height, textW, size)) {
            page.drawText(text, {
              x: p.x,
              y: p.y,
              size,
              font,
              color: rgb(r, g, b),
              opacity: op,
              rotate: degrees(p.rot),
            });
          }
        }
      } else if (this.imgBytes) {
        const img =
          this.imgType === 'png'
            ? await doc.embedPng(this.imgBytes)
            : await doc.embedJpg(this.imgBytes);
        const aspect = img.height / img.width;
        for (let i = 0; i < doc.getPageCount(); i++) {
          const page = doc.getPage(i);
          const { width, height } = page.getSize();
          for (const p of this.imagePositions(pos, width, height)) {
            const w = p.w;
            const h = w * aspect;
            page.drawImage(img, {
              x: p.x - w / 2,
              y: p.y - h / 2,
              width: w,
              height: h,
              opacity: op,
              rotate: degrees(p.rot),
            });
          }
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      this.downloadBytes(bytes, this.suffixed(this.fileName(), '-watermarked'), 'application/pdf');
      this.status.set(
        this.t('labels.statusDone').replace('{n}', String(doc.getPageCount()))
      );
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private textPositions(
    pos: WmPos,
    w: number,
    h: number,
    textW: number,
    size: number
  ): { x: number; y: number; rot: number }[] {
    const rot = this.angle();
    if (pos === 'center') return [{ x: w / 2 - textW / 2, y: h / 2, rot: 0 }];
    if (pos === 'diagonal')
      return [{ x: w / 2 - textW / 2, y: h / 2 - size / 2, rot }];
    if (pos === 'corners') {
      const m = 60;
      return [
        { x: m, y: h - m, rot: 0 },
        { x: w - m - textW, y: h - m, rot: 0 },
        { x: m, y: m, rot: 0 },
        { x: w - m - textW, y: m, rot: 0 },
      ];
    }
    const out: { x: number; y: number; rot: number }[] = [];
    const stepX = textW + 140;
    const stepY = size * 3.2;
    for (let y = stepY / 2; y < h; y += stepY) {
      for (let x = -textW / 2; x < w; x += stepX) {
        out.push({ x, y, rot });
      }
    }
    return out;
  }

  private imagePositions(
    pos: WmPos,
    w: number,
    h: number
  ): { x: number; y: number; w: number; rot: number }[] {
    const rot = this.angle();
    const baseW = Math.min(w, h) * 0.35;
    if (pos === 'center') return [{ x: w / 2, y: h / 2, w: baseW, rot: 0 }];
    if (pos === 'diagonal') return [{ x: w / 2, y: h / 2, w: baseW, rot }];
    if (pos === 'corners') {
      const m = 70;
      const cw = baseW * 0.45;
      return [
        { x: m, y: h - m, w: cw, rot: 0 },
        { x: w - m, y: h - m, w: cw, rot: 0 },
        { x: m, y: m, w: cw, rot: 0 },
        { x: w - m, y: m, w: cw, rot: 0 },
      ];
    }
    const out: { x: number; y: number; w: number; rot: number }[] = [];
    const step = baseW * 1.6;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        out.push({ x, y, w: baseW * 0.7, rot });
      }
    }
    return out;
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private suffixed(name: string, suffix: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix + '.pdf';
  }

  private downloadBytes(bytes: Uint8Array, name: string, type: string): void {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const url = URL.createObjectURL(new Blob([ab], { type }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
