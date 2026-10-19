import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

type BgMode = 'transparent' | 'white' | 'custom';

@Component({
  selector: 'app-round-corners',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './round-corners.component.html',
  styleUrl: './round-corners.component.scss',
})
export class RoundCornersComponent implements OnDestroy {
  readonly slug = 'round-corners';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-resizer', 'merge-images', 'photo-overlay', 'solid-background-remover'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly image = signal<{ img: HTMLImageElement; width: number; height: number; name: string } | null>(null);
  readonly radiusPct = signal(10);
  readonly bgMode = signal<BgMode>('transparent');
  readonly customColor = signal('#ffffff');
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly errorMsg = signal('');

  readonly hasOutput = computed(() => this.image() !== null);

  readonly radiusPx = computed(() => {
    const im = this.image();
    if (!im) return 0;
    return Math.round((Math.min(im.width, im.height) * this.radiusPct()) / 100);
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  @ViewChild('roundCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private objectUrls: string[] = [];
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
    img.onload = () => this.image.set({ img, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    img.onerror = () => this.errorMsg.set(this.t('labels.loadFailed'));
    img.src = url;
    input.value = '';
  }

  setRadiusPct(v: number): void { this.radiusPct.set(this.clampNum(v, 0, 50)); }
  setBgMode(m: BgMode): void { this.bgMode.set(m); }
  setCustomColor(c: string): void { this.customColor.set(c); }
  setFormat(f: 'png' | 'jpeg'): void { this.format.set(f); }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.hasOutput()) return;
    const mime = this.format() === 'png' ? 'image/png' : 'image/jpeg';
    const a = this.document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.92);
    a.download = `rounded-image.${this.format() === 'png' ? 'png' : 'jpg'}`;
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

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    const im = this.image();
    if (!canvas || !im) return;
    canvas.width = im.width;
    canvas.height = im.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const r = this.radiusPx();
    const w = im.width;
    const h = im.height;
    ctx.clearRect(0, 0, w, h);
    if (this.bgMode() !== 'transparent') {
      ctx.fillStyle = this.bgMode() === 'custom' ? this.customColor() : '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arcTo(w, 0, w, r, r);
    ctx.lineTo(w, h - r);
    ctx.arcTo(w, h, w - r, h, r);
    ctx.lineTo(r, h);
    ctx.arcTo(0, h, 0, h - r, r);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(im.img, 0, 0);
    ctx.restore();
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
