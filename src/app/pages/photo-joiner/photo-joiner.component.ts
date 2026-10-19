import { Component, computed, effect, inject, OnDestroy, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-photo-joiner',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-joiner.component.html',
  styleUrl: './photo-joiner.component.scss',
})
export class PhotoJoinerComponent implements OnDestroy {
  readonly slug = 'photo-joiner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['collage-maker', 'bulk-image-resizer', 'photo-border-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly direction = signal<'vertical' | 'horizontal'>('vertical');
  readonly gap = signal(16);
  readonly bgColor = signal('#ffffff');
  readonly photos = signal<HTMLImageElement[]>([]);
  readonly outW = signal(0);
  readonly outH = signal(0);
  readonly fileError = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly photoCount = computed(() => this.photos().length);

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

  setDirection(d: 'vertical' | 'horizontal'): void {
    this.direction.set(d);
    this.render();
  }

  setGap(v: number): void {
    this.gap.set(this.clampNum(v, 0, 100));
    this.render();
  }

  setBgColor(c: string): void {
    this.bgColor.set(c);
    this.render();
  }

  clearPhotos(): void {
    this.photos.set([]);
    this.outW.set(0);
    this.outH.set(0);
    this.render();
  }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (this.photos().length + files.length > 20) {
      this.fileError.set(this.t('labels.tooMany'));
      return;
    }
    this.fileError.set('');
    let loaded = 0;
    const fresh: HTMLImageElement[] = [];
    const finish = () => {
      if (fresh.length) {
        this.photos.set([...this.photos(), ...fresh].slice(0, 20));
        this.render();
      }
    };
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        if (++loaded === files.length) finish();
        continue;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        fresh.push(img);
        if (++loaded === files.length) finish();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (++loaded === files.length) finish();
      };
      img.src = url;
    }
  }

  render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const photos = this.photos();
    if (!photos.length) {
      canvas.width = 0;
      canvas.height = 0;
      this.outW.set(0);
      this.outH.set(0);
      return;
    }
    const g = this.gap();
    const vertical = this.direction() === 'vertical';
    const first = photos[0];
    const fw = first.naturalWidth;
    const fh = first.naturalHeight;
    const sizes = photos.map((img) => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (vertical) {
        const sc = fw / iw;
        return { w: fw, h: Math.round(ih * sc) };
      }
      const sc = fh / ih;
      return { w: Math.round(iw * sc), h: fh };
    });
    const totalGap = g * (photos.length - 1);
    const cw = vertical ? fw : sizes.reduce((s, z) => s + z.w, 0) + totalGap;
    const ch = vertical ? sizes.reduce((s, z) => s + z.h, 0) + totalGap : fh;
    canvas.width = cw;
    canvas.height = ch;
    ctx.fillStyle = this.bgColor();
    ctx.fillRect(0, 0, cw, ch);
    let cursor = 0;
    photos.forEach((img, i) => {
      const z = sizes[i];
      if (vertical) {
        ctx.drawImage(img, 0, cursor, z.w, z.h);
        cursor += z.h + g;
      } else {
        ctx.drawImage(img, cursor, 0, z.w, z.h);
        cursor += z.w + g;
      }
    });
    this.outW.set(cw);
    this.outH.set(ch);
  }

  download(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.photoCount() < 2) return;
    const a = this.document.createElement('a');
    a.download = 'combined-image.png';
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
