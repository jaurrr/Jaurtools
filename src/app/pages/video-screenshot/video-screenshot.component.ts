import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

const MAX_BYTES = 500 * 1024 * 1024;

interface Shot {
  id: number;
  url: string;
  name: string;
  timeSec: number;
  format: 'png' | 'jpeg';
  size: number;
}

@Component({
  selector: 'app-video-screenshot',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './video-screenshot.component.html',
  styleUrl: './video-screenshot.component.scss',
})
export class VideoScreenshotComponent implements OnDestroy {
  readonly slug = 'video-screenshot';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['gif-resizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('videoRef');

  readonly fileName = signal('');
  readonly videoReady = signal(false);
  readonly durationSec = signal(0);
  readonly seekSec = signal(0);
  readonly format = signal<'png' | 'jpeg'>('png');
  readonly jpegQuality = signal(85);
  readonly capturing = signal(false);
  readonly error = signal('');
  readonly shots = signal<Shot[]>([]);

  private videoObjectUrl = '';
  private nextId = 1;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  readonly durationText = computed(() => this.fmtTime(this.durationSec()));

  readonly shotSizeText = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

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

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.clearShots();
    this.videoReady.set(false);
    if (!file) return;
    const okType = file.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(file.name);
    if (!okType) {
      this.error.set(this.t('labels.errType'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set(this.t('labels.errSize'));
      input.value = '';
      return;
    }
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoObjectUrl = URL.createObjectURL(file);
    this.fileName.set(file.name);
    const v = this.videoRef()?.nativeElement;
    if (v) {
      v.src = this.videoObjectUrl;
      v.load();
    }
  }

  onVideoMeta(v: HTMLVideoElement) {
    this.durationSec.set(v.duration || 0);
    this.seekSec.set(0);
    this.videoReady.set(true);
  }

  setSeek(v: number) {
    const s = this.clampNum(v, 0, Math.max(0, this.durationSec()));
    this.seekSec.set(s);
    const el = this.videoRef()?.nativeElement;
    if (el && this.videoReady()) {
      try {
        el.currentTime = s;
      } catch {
        /* ignore */
      }
    }
  }
  setFormat(f: 'png' | 'jpeg') {
    this.format.set(f);
  }
  setQuality(v: number) {
    this.jpegQuality.set(this.clampNum(v, 10, 100));
  }

  async capture() {
    const v = this.videoRef()?.nativeElement;
    if (!v || !this.videoReady()) {
      this.error.set(this.t('labels.errNotReady'));
      return;
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (w < 2 || h < 2) {
      this.error.set(this.t('labels.errCapture'));
      return;
    }
    this.error.set('');
    this.capturing.set(true);
    try {
      const target = this.seekSec();
      if (Math.abs(v.currentTime - target) > 0.05) {
        v.pause();
        v.currentTime = target;
        await new Promise<void>((resolve) => {
          const done = () => {
            v.removeEventListener('seeked', done);
            resolve();
          };
          v.addEventListener('seeked', done);
          window.setTimeout(done, 4000);
        });
      }
      const canvas = this.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-ctx');
      ctx.drawImage(v, 0, 0, w, h);
      const fmt = this.format();
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, fmt === 'jpeg' ? this.jpegQuality() / 100 : undefined)
      );
      if (!blob) throw new Error('encode');
      const url = URL.createObjectURL(blob);
      const id = this.nextId++;
      const t = Math.round(target * 10) / 10;
      const shot: Shot = {
        id,
        url,
        name: `jaurtools-frame-${String(t).replace('.', 'p')}s.${fmt === 'png' ? 'png' : 'jpg'}`,
        timeSec: t,
        format: fmt,
        size: blob.size,
      };
      this.shots.set([shot, ...this.shots()]);
    } catch {
      this.error.set(this.t('labels.errCapture'));
    } finally {
      this.capturing.set(false);
    }
  }

  removeShot(id: number) {
    const shot = this.shots().find((s) => s.id === id);
    if (shot) URL.revokeObjectURL(shot.url);
    this.shots.set(this.shots().filter((s) => s.id !== id));
  }

  clearShots() {
    for (const s of this.shots()) URL.revokeObjectURL(s.url);
    this.shots.set([]);
  }

  ngOnDestroy() {
    this.clearShots();
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
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
