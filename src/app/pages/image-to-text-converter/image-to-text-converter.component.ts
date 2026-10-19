import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: string | HTMLImageElement,
        lang: string,
        options?: { logger?: (m: { status: string; progress: number }) => void }
      ) => Promise<{ data: { text: string } }>;
    };
  }
}

@Component({
  selector: 'app-image-to-text-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-to-text-converter.component.html',
  styleUrl: './image-to-text-converter.component.scss',
})
export class ImageToTextConverterComponent implements OnDestroy {
  readonly slug = 'image-to-text-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-to-base64-converter', 'image-converter', 'photo-filters'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly lang = signal('eng');
  readonly loadingEngine = signal(false);
  readonly recognizing = signal(false);
  readonly progress = signal(0);
  readonly statusText = signal('');
  readonly resultText = signal('');
  readonly copied = signal(false);
  readonly previewUrl = signal('');

  private objectUrl: string | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasImage = computed(() => this.fileName().length > 0);
  readonly busy = computed(() => this.loadingEngine() || this.recognizing());
  readonly ocrLangs = computed(() => [
    { value: 'eng', label: this.t('labels.langEnglish') },
    { value: 'hin', label: this.t('labels.langHindi') },
    { value: 'ara', label: this.t('labels.langArabic') },
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

  setLang(v: string) {
    if (v === 'eng' || v === 'hin' || v === 'ara') this.lang.set(v);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.resultText.set('');
    this.progress.set(0);
    this.statusText.set('');
    this.copied.set(false);
    this.previewUrl.set('');
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  async recognize() {
    if (!this.objectUrl || this.busy()) return;
    this.error.set('');
    this.resultText.set('');
    this.progress.set(0);
    try {
      this.loadingEngine.set(true);
      this.statusText.set(this.t('labels.statusLoading'));
      await this.ensureEngine();
      this.loadingEngine.set(false);
      this.recognizing.set(true);
      const worker = window.Tesseract;
      if (!worker) throw new Error('engine');
      const out = await worker.recognize(this.objectUrl, this.lang(), {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.progress.set(Math.round(m.progress * 100));
            this.statusText.set(this.t('labels.statusReading'));
          }
        },
      });
      this.resultText.set(out.data.text.trim());
      this.progress.set(100);
      this.statusText.set('');
    } catch {
      this.error.set(this.t('labels.ocrFailed'));
      this.statusText.set('');
    }
    this.loadingEngine.set(false);
    this.recognizing.set(false);
  }

  private ensureEngine(): Promise<void> {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('cdn'));
      this.document.head.appendChild(script);
    });
  }

  copyText() {
    const text = this.resultText();
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  downloadTxt() {
    const blob = new Blob([this.resultText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    const dot = this.fileName().lastIndexOf('.');
    const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
    a.href = url;
    a.download = `${base}-ocr.txt`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  private loadFile(file: File) {
    this.error.set('');
    this.resultText.set('');
    this.copied.set(false);
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    this.previewUrl.set(this.objectUrl);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
