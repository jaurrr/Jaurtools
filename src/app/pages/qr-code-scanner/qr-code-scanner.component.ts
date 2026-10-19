import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-qr-code-scanner',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './qr-code-scanner.component.html',
  styleUrl: './qr-code-scanner.component.scss',
})
export class QrCodeScannerComponent implements OnDestroy {
  readonly slug = 'qr-code-scanner';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['barcode-generator', 'bulk-qr-code-generator', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly supported = signal(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  readonly result = signal('');
  readonly error = signal('');
  readonly scanning = signal(false);
  readonly cameraOn = signal(false);
  readonly copied = signal(false);

  private videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');
  private stream: MediaStream | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
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

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.errorType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error.set(this.t('labels.errorSize'));
      return;
    }
    this.error.set('');
    this.result.set('');
    try {
      const bmp = await createImageBitmap(file);
      await this.detect(bmp);
      bmp.close();
    } catch {
      this.error.set(this.t('labels.errorDecode'));
    }
  }

  private async detect(source: ImageBitmapSource): Promise<void> {
    if (!this.supported()) {
      this.error.set(this.t('labels.errorUnsupported'));
      return;
    }
    this.scanning.set(true);
    try {
      const Detector = (window as unknown as { BarcodeDetector: new (o: object) => { detect(s: ImageBitmapSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      const codes = await detector.detect(source);
      if (codes && codes.length > 0 && codes[0].rawValue) {
        this.result.set(codes[0].rawValue);
        this.error.set('');
      } else {
        this.error.set(this.t('labels.errorNotFound'));
      }
    } catch {
      this.error.set(this.t('labels.errorDecode'));
    } finally {
      this.scanning.set(false);
    }
  }

  async startCamera(): Promise<void> {
    this.error.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      const v = this.videoEl()?.nativeElement;
      if (v) {
        v.srcObject = this.stream;
        await v.play();
      }
      this.cameraOn.set(true);
    } catch {
      this.error.set(this.t('labels.errorCamera'));
    }
  }

  stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const v = this.videoEl()?.nativeElement;
    if (v) v.srcObject = null;
    this.cameraOn.set(false);
  }

  async capture(): Promise<void> {
    const v = this.videoEl()?.nativeElement;
    if (!v || v.videoWidth === 0) return;
    const canvas = this.document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    const bmp = await createImageBitmap(canvas);
    await this.detect(bmp);
    bmp.close();
  }

  async copyResult(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.result()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.stopCamera();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
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
