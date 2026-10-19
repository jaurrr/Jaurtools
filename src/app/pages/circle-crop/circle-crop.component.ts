import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-circle-crop',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './circle-crop.component.html',
  styleUrl: './circle-crop.component.scss',
})
export class CircleCropComponent implements OnDestroy {
  readonly slug = 'circle-crop';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-triangle-generator', 'unit-converter', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly sizes = [128, 170, 256, 400, 500, 512, 1024];
  readonly platforms = [
    { name: 'Discord', size: 128 },
    { name: 'Facebook', size: 170 },
    { name: 'LinkedIn', size: 400 },
    { name: 'X', size: 400 },
    { name: 'WhatsApp', size: 500 },
    { name: 'Telegram', size: 512 },
    { name: 'Zoom', size: 512 },
  ];
  readonly size = signal(512);
  readonly preview = signal('');
  readonly fileName = signal('');
  readonly error = signal('');

  private objectUrl: string | null = null;
  private lastImg: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    this.fileName.set(file.name);
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.lastImg = img;
      this.draw();
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }
    };
    img.onerror = () => {
      this.error.set(this.t('labels.errLoad'));
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }
    };
    img.src = this.objectUrl;
  }

  setSize(s: number) {
    this.size.set(s);
    if (this.lastImg) this.draw();
  }

  download() {
    const canvas = this.document.getElementById('circle-crop-canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.preview()) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = url;
      a.download = 'circle-crop.png';
      this.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
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

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private draw() {
    const img = this.lastImg;
    const canvas = this.document.getElementById('circle-crop-canvas') as HTMLCanvasElement | null;
    if (!img || !canvas) return;
    const s = this.size();
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, sx, sy, side, side, 0, 0, s, s);
    ctx.restore();
    this.preview.set(canvas.toDataURL('image/png'));
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
