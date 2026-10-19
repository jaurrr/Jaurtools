import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-meme-generator',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './meme-generator.component.html',
  styleUrl: './meme-generator.component.scss',
})
export class MemeGeneratorComponent implements OnDestroy {
  readonly slug = 'meme-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['profile-picture-maker', 'photo-filters', 'image-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly topText = signal('');
  readonly bottomText = signal('');
  readonly fontSize = signal(48);
  readonly outline = signal(true);

  private objectUrl: string | null = null;
  private imgEl: HTMLImageElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);

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

  setTopText(v: string) {
    this.topText.set(v.slice(0, 120));
    this.render();
  }
  setBottomText(v: string) {
    this.bottomText.set(v.slice(0, 120));
    this.render();
  }
  setFontSize(v: number) {
    this.fontSize.set(this.clampNum(v, 20, 120));
    this.render();
  }
  setOutline(v: boolean) {
    this.outline.set(v);
    this.render();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.topText.set('');
    this.bottomText.set('');
    this.imgEl = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  download() {
    const canvas = this.buildCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      const dot = this.fileName().lastIndexOf('.');
      const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
      a.href = url;
      a.download = `${base}-meme.png`;
      this.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  private buildCanvas(): HTMLCanvasElement | null {
    const img = this.imgEl;
    if (!img) return null;
    const canvas = this.document.createElement('canvas');
    const MAX = 1200;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const fs = Math.round(this.fontSize() * (canvas.width / 600));
    ctx.font = `bold ${fs}px Impact, 'Arial Black', 'Arial Narrow Bold', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(2, Math.round(fs / 12));
    const lineHeight = fs * 1.15;
    const wrap = (text: string): string[] => {
      const words = text.toUpperCase().split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (ctx.measureText(trial).width > canvas.width - 40 && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      return lines;
    };
    const drawLines = (lines: string[], startY: number) => {
      lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        if (this.outline()) ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillText(line, canvas.width / 2, y);
      });
    };
    const topLines = wrap(this.topText());
    drawLines(topLines, 16);
    const bottomLines = wrap(this.bottomText());
    const totalBottom = bottomLines.length * lineHeight;
    ctx.textBaseline = 'top';
    drawLines(bottomLines, canvas.height - totalBottom - 16);
    return canvas;
  }

  private render() {
    const view = this.document.getElementById('mg-canvas');
    const canvas = this.buildCanvas();
    if (!view || !canvas) return;
    view.replaceChildren(canvas);
    canvas.setAttribute('aria-label', this.t('labels.previewLabel'));
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
    const img = new Image();
    img.onload = () => {
      this.imgEl = img;
      this.setTopText('TOP TEXT');
      this.setBottomText('BOTTOM TEXT');
    };
    img.onerror = () => this.error.set(this.t('labels.loadFailed'));
    img.src = this.objectUrl;
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
