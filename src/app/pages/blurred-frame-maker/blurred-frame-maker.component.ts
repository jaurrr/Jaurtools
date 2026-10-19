import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-blurred-frame-maker',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './blurred-frame-maker.component.html',
  styleUrl: './blurred-frame-maker.component.scss',
})
export class BlurredFrameMakerComponent implements OnDestroy {
  readonly slug = 'blurred-frame-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['photo-border-maker', 'bulk-image-resizer', 'photo-joiner', 'collage-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly ratio = signal('1:1');
  readonly blur = signal(25);
  readonly dim = signal(30);
  readonly hasImage = signal(false);
  readonly outW = signal(0);
  readonly outH = signal(0);
  readonly fileError = signal('');

  readonly ratios = ['1:1', '4:5', '3:4', '9:16', '16:9'];

  private img: HTMLImageElement | null = null;
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

  ratioLabel(r: string): string {
    const map: Record<string, string> = {
      '1:1': 'ratio11', '4:5': 'ratio45', '3:4': 'ratio34', '9:16': 'ratio916', '16:9': 'ratio169',
    };
    return this.t(`labels.${map[r] ?? 'ratio11'}`);
  }

  setRatio(r: string): void {
    this.ratio.set(r);
    this.render();
  }

  setBlur(v: number): void {
    this.blur.set(this.clampNum(v, 0, 60));
    this.render();
  }

  setDim(v: number): void {
    this.dim.set(this.clampNum(v, 0, 80));
    this.render();
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.fileError.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.fileError.set(this.t('labels.fileTooLarge'));
      return;
    }
    this.fileError.set('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.img = img;
      this.hasImage.set(true);
      URL.revokeObjectURL(url);
      this.render();
    };
    img.onerror = () => {
      this.fileError.set(this.t('labels.loadFailed'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const img = this.img;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const [a, b] = this.ratio().split(':').map(Number);
    const base = 1080;
    const cw = Math.round((base * a) / Math.max(a, b));
    const ch = Math.round((base * b) / Math.max(a, b));
    canvas.width = cw;
    canvas.height = ch;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    ctx.filter = 'none';
    const coverScale = Math.max(cw / iw, ch / ih);
    const bw = iw * coverScale;
    const bh = ih * coverScale;
    ctx.save();
    ctx.filter = `blur(${this.blur()}px)`;
    ctx.drawImage(img, (cw - bw) / 2, (ch - bh) / 2, bw, bh);
    ctx.restore();
    ctx.filter = 'none';
    if (this.dim() > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.dim() / 100})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    const fitScale = Math.min(cw / iw, ch / ih);
    const fw = iw * fitScale;
    const fh = ih * fitScale;
    ctx.drawImage(img, (cw - fw) / 2, (ch - fh) / 2, fw, fh);
    this.outW.set(cw);
    this.outH.set(ch);
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasImage()) return;
    const a = this.document.createElement('a');
    a.download = 'framed-image.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  ngOnDestroy(): void {
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
