import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

interface FilterDef {
  key: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  css: (v: number) => string;
}

@Component({
  selector: 'app-photo-filters',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './photo-filters.component.html',
  styleUrl: './photo-filters.component.scss',
})
export class PhotoFiltersComponent implements OnDestroy {
  readonly slug = 'photo-filters';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-compressor', 'image-resizer', 'image-cropper'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly brightness = signal(100);
  readonly contrast = signal(100);
  readonly saturate = signal(100);
  readonly grayscale = signal(0);
  readonly sepia = signal(0);
  readonly blur = signal(0);
  readonly hueRotate = signal(0);
  readonly invert = signal(0);
  readonly activePreset = signal('none');

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
  readonly filterDefs = computed<FilterDef[]>(() => [
    { key: 'brightness', min: 0, max: 200, step: 1, unit: '%', css: (v) => `brightness(${v}%)` },
    { key: 'contrast', min: 0, max: 200, step: 1, unit: '%', css: (v) => `contrast(${v}%)` },
    { key: 'saturate', min: 0, max: 200, step: 1, unit: '%', css: (v) => `saturate(${v}%)` },
    { key: 'grayscale', min: 0, max: 100, step: 1, unit: '%', css: (v) => `grayscale(${v}%)` },
    { key: 'sepia', min: 0, max: 100, step: 1, unit: '%', css: (v) => `sepia(${v}%)` },
    { key: 'blur', min: 0, max: 10, step: 0.5, unit: 'px', css: (v) => `blur(${v}px)` },
    { key: 'hueRotate', min: 0, max: 360, step: 1, unit: 'deg', css: (v) => `hue-rotate(${v}deg)` },
    { key: 'invert', min: 0, max: 100, step: 1, unit: '%', css: (v) => `invert(${v}%)` },
  ]);
  readonly presets = computed(() => [
    { value: 'none', label: this.t('labels.presetNone') },
    { value: 'vivid', label: this.t('labels.presetVivid') },
    { value: 'mono', label: this.t('labels.presetMono') },
    { value: 'vintage', label: this.t('labels.presetVintage') },
    { value: 'cool', label: this.t('labels.presetCool') },
    { value: 'warm', label: this.t('labels.presetWarm') },
  ]);

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

  filterValue(key: string): number {
    switch (key) {
      case 'brightness': return this.brightness();
      case 'contrast': return this.contrast();
      case 'saturate': return this.saturate();
      case 'grayscale': return this.grayscale();
      case 'sepia': return this.sepia();
      case 'blur': return this.blur();
      case 'hueRotate': return this.hueRotate();
      case 'invert': return this.invert();
      default: return 0;
    }
  }

  setFilter(key: string, v: number) {
    const val = this.clampNum(v, -360, 360);
    switch (key) {
      case 'brightness': this.brightness.set(val); break;
      case 'contrast': this.contrast.set(val); break;
      case 'saturate': this.saturate.set(val); break;
      case 'grayscale': this.grayscale.set(val); break;
      case 'sepia': this.sepia.set(val); break;
      case 'blur': this.blur.set(val); break;
      case 'hueRotate': this.hueRotate.set(val); break;
      case 'invert': this.invert.set(val); break;
    }
    this.activePreset.set('none');
    this.render();
  }

  applyPreset(name: string) {
    this.activePreset.set(name);
    const d = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, hueRotate: 0, invert: 0 };
    switch (name) {
      case 'vivid': Object.assign(d, { contrast: 120, saturate: 140 }); break;
      case 'mono': Object.assign(d, { grayscale: 100, contrast: 110 }); break;
      case 'vintage': Object.assign(d, { sepia: 60, contrast: 90, brightness: 105 }); break;
      case 'cool': Object.assign(d, { hueRotate: 15, saturate: 110 }); break;
      case 'warm': Object.assign(d, { sepia: 30, saturate: 120 }); break;
    }
    this.brightness.set(d.brightness);
    this.contrast.set(d.contrast);
    this.saturate.set(d.saturate);
    this.grayscale.set(d.grayscale);
    this.sepia.set(d.sepia);
    this.blur.set(d.blur);
    this.hueRotate.set(d.hueRotate);
    this.invert.set(d.invert);
    this.render();
  }

  resetFilters() {
    this.applyPreset('none');
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.imgEl = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  download() {
    const canvas = this.document.getElementById('if-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      const dot = this.fileName().lastIndexOf('.');
      const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
      a.href = url;
      a.download = `${base}-filtered.png`;
      this.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  private filterString(): string {
    return this.filterDefs()
      .map((d) => d.css(this.filterValue(d.key)))
      .join(' ');
  }

  readonly comparing = signal(false);

  holdOriginal() {
    const canvas = this.document.getElementById('if-canvas') as HTMLCanvasElement | null;
    const img = this.imgEl;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = 'none';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    this.comparing.set(true);
  }

  releaseOriginal() {
    if (!this.comparing()) return;
    this.comparing.set(false);
    this.render();
  }

  private render() {
    const canvas = this.document.getElementById('if-canvas') as HTMLCanvasElement | null;
    const img = this.imgEl;
    if (!canvas || !img) return;
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = this.filterString();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  private loadFile(file: File) {
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    this.applyPreset('none');
    const img = new Image();
    img.onload = () => {
      this.imgEl = img;
      this.render();
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
