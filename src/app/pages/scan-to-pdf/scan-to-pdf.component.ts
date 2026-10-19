import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const MAX_IMG_BYTES = 15 * 1024 * 1024;
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;

type Source = 'camera' | 'upload';

interface Shot {
  url: string;
  blob: Blob;
  kind: 'png' | 'jpg';
}

@Component({
  selector: 'app-scan-to-pdf',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './scan-to-pdf.component.html',
  styleUrl: './scan-to-pdf.component.scss',
})
export class ScanToPdfComponent implements OnDestroy {
  readonly slug = 'scan-to-pdf';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['pdf-to-jpg', 'pdf-to-zip', 'rotate-pdf'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly source = signal<Source>('camera');
  readonly streaming = signal(false);
  readonly shots = signal<Shot[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly status = signal('');

  private stream: MediaStream | null = null;
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

  readonly hasShots = computed(() => this.shots().length > 0);

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

  setSource(s: Source): void {
    if (s !== 'camera') this.stopCamera();
    this.source.set(s);
    this.error.set('');
  }

  async startCamera(): Promise<void> {
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(this.t('labels.errNoCamera'));
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      const v = this.document.getElementById('scan-video') as HTMLVideoElement | null;
      if (!v) throw new Error('video');
      v.srcObject = this.stream;
      await v.play();
      this.streaming.set(true);
    } catch {
      this.error.set(this.t('labels.errCameraDenied'));
      this.stopCamera();
    }
  }

  stopCamera(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    const v = this.document.getElementById('scan-video') as HTMLVideoElement | null;
    if (v) v.srcObject = null;
    this.streaming.set(false);
  }

  async capture(): Promise<void> {
    const v = this.document.getElementById('scan-video') as HTMLVideoElement | null;
    if (!v || !this.streaming() || v.videoWidth < 2) return;
    const canvas = this.document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.92)
    );
    if (!blob) return;
    this.addShot(blob, 'jpg');
    this.status.set(this.t('labels.statusShot').replace('{n}', String(this.shots().length)));
  }

  async onImagesSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    this.error.set('');
    for (const file of files) {
      const isPng = file.type === 'image/png';
      const isJpg = file.type === 'image/jpeg';
      if (!isPng && !isJpg) {
        this.error.set(this.t('labels.errImgType').replace('{n}', file.name));
        continue;
      }
      if (file.size > MAX_IMG_BYTES) {
        this.error.set(this.t('labels.errImgSize').replace('{n}', file.name));
        continue;
      }
      this.addShot(file, isPng ? 'png' : 'jpg');
    }
    input.value = '';
  }

  removeShot(i: number): void {
    const next = this.shots().slice();
    const [gone] = next.splice(i, 1);
    if (gone) URL.revokeObjectURL(gone.url);
    this.shots.set(next);
  }

  moveShot(i: number, dir: -1 | 1): void {
    const next = this.shots().slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    this.shots.set(next);
  }

  async createPdf(): Promise<void> {
    const list = this.shots();
    if (!list.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const doc = await PDFDocument.create();
      for (const s of list) {
        const bytes = new Uint8Array(await s.blob.arrayBuffer());
        const img = s.kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([A4_W, A4_H]);
        const imgWpt = (img.width * 72) / 96;
        const imgHpt = (img.height * 72) / 96;
        const scale = Math.min((A4_W - MARGIN * 2) / imgWpt, (A4_H - MARGIN * 2) / imgHpt, 1);
        const w = imgWpt * scale;
        const h = imgHpt * scale;
        page.drawImage(img, { x: (A4_W - w) / 2, y: (A4_H - h) / 2, width: w, height: h });
      }
      const bytes = await doc.save({ useObjectStreams: true });
      this.downloadBytes(bytes, 'scanned-document.pdf', 'application/pdf');
      this.status.set(this.t('labels.statusDone').replace('{n}', String(list.length)));
    } catch {
      this.error.set(this.t('labels.errProcess'));
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    for (const s of this.shots()) URL.revokeObjectURL(s.url);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private addShot(blob: Blob, kind: 'png' | 'jpg'): void {
    this.shots.set([...this.shots(), { url: URL.createObjectURL(blob), blob, kind }]);
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
