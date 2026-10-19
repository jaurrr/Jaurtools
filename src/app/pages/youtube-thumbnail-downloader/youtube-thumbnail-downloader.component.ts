import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface Thumb {
  key: string;
  dims: string;
  url: string;
  status: 'checking' | 'ok' | 'missing';
}

const RESOLUTIONS = [
  { key: 'maxresdefault', dims: '1280 × 720' },
  { key: 'sddefault', dims: '640 × 480' },
  { key: 'hqdefault', dims: '480 × 360' },
  { key: 'mqdefault', dims: '320 × 180' },
  { key: 'default', dims: '120 × 90' },
];

@Component({
  selector: 'app-youtube-thumbnail-downloader',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './youtube-thumbnail-downloader.component.html',
  styleUrl: './youtube-thumbnail-downloader.component.scss',
})
export class YoutubeThumbnailDownloaderComponent implements OnDestroy {
  readonly slug = 'youtube-thumbnail-downloader';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['vignette-effect', 'qr-code-generator', 'word-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal('');
  readonly videoId = signal('');
  readonly grabbed = signal(false);
  readonly thumbs = signal<Thumb[]>([]);
  readonly error = signal('');
  readonly copiedKey = signal<string | null>(null);
  readonly downloadingKey = signal<string | null>(null);

  private downloadUrl: string | null = null;
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

  readonly best = computed(() => this.thumbs().find((t) => t.status === 'ok') ?? null);

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

  onInput(value: string): void {
    this.input.set(value);
  }

  grab(): void {
    const id = this.parseId(this.input());
    if (!id) {
      this.error.set(this.t('labels.errInvalid'));
      this.grabbed.set(false);
      this.thumbs.set([]);
      return;
    }
    this.error.set('');
    this.videoId.set(id);
    this.grabbed.set(true);
    this.copiedKey.set(null);
    const list: Thumb[] = RESOLUTIONS.map((r) => ({
      key: r.key,
      dims: r.dims,
      url: `https://i.ytimg.com/vi/${id}/${r.key}.jpg`,
      status: 'checking' as const,
    }));
    this.thumbs.set(list);
    list.forEach((t) => this.probe(t));
  }

  async downloadThumb(t: Thumb): Promise<void> {
    if (this.downloadingKey()) return;
    this.downloadingKey.set(t.key);
    this.error.set('');
    try {
      const res = await fetch(t.url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = this.downloadUrl;
      a.download = `jaurtools-thumbnail-${this.videoId()}-${t.key}.jpg`;
      this.document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      this.error.set(this.t('labels.errDownload'));
    } finally {
      this.downloadingKey.set(null);
    }
  }

  async copyLink(t: Thumb): Promise<void> {
    try {
      await navigator.clipboard.writeText(t.url).catch(() => undefined);
      this.copiedKey.set(t.key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(null), 2000);
    } catch {
      this.error.set(this.t('labels.errCopy'));
    }
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseId(raw: string): string | null {
    const v = raw.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = v.match(
      /(?:youtube\.com\/(?:watch\?[^#]*?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    );
    return m ? m[1] : null;
  }

  private probe(t: Thumb): void {
    const img = new Image();
    img.onload = () => this.setStatus(t.key, 'ok');
    img.onerror = () => this.setStatus(t.key, 'missing');
    img.src = t.url;
  }

  private setStatus(key: string, status: Thumb['status']): void {
    this.thumbs.update((list) => list.map((t) => (t.key === key ? { ...t, status } : t)));
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
