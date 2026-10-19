import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { PasteDropDirective } from '../../components/paste-drop/paste-drop.directive';

@Component({
  selector: 'app-image-to-base64-converter',
  standalone: true,
  imports: [PasteDropDirective, FormsModule, IconComponent, RouterLink],
  templateUrl: './image-to-base64-converter.component.html',
  styleUrl: './image-to-base64-converter.component.scss',
})
export class ImageToBase64ConverterComponent implements OnDestroy {
  readonly slug = 'image-to-base64-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['image-converter', 'image-compressor', 'image-resizer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fileName = signal('');
  readonly error = signal('');
  readonly mimeType = signal('');
  readonly fileSize = signal(0);
  readonly dataUrl = signal('');
  readonly includePrefix = signal(true);
  readonly copied = signal(false);
  readonly processing = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly hasResult = computed(() => this.dataUrl().length > 0);
  readonly base64Only = computed(() => {
    const url = this.dataUrl();
    const comma = url.indexOf(',');
    return comma >= 0 ? url.slice(comma + 1) : url;
  });
  readonly output = computed(() => (this.includePrefix() ? this.dataUrl() : this.base64Only()));
  readonly base64Length = computed(() => this.base64Only().length);
  readonly overheadPct = computed(() => {
    const s = this.fileSize();
    if (s <= 0) return 0;
    return Math.round(((this.base64Length() - s) / s) * 100);
  });

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

  setIncludePrefix(v: boolean) {
    this.includePrefix.set(v);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
  }

  reset() {
    this.fileName.set('');
    this.error.set('');
    this.mimeType.set('');
    this.fileSize.set(0);
    this.dataUrl.set('');
    this.copied.set(false);
  }

  copyOutput() {
    if (!this.output() || !navigator.clipboard) return;
    navigator.clipboard.writeText(this.output()).then(() => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  downloadTxt() {
    const blob = new Blob([this.output()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    const dot = this.fileName().lastIndexOf('.');
    const base = dot > 0 ? this.fileName().slice(0, dot) : this.fileName();
    a.href = url;
    a.download = `${base}.base64.txt`;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  private loadFile(file: File) {
    this.error.set('');
    this.copied.set(false);
    if (!file.type.startsWith('image/')) {
      this.error.set(this.t('labels.invalidFile'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.error.set(this.t('labels.fileTooBig'));
      return;
    }
    this.processing.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        this.error.set(this.t('labels.encodeFailed'));
        this.processing.set(false);
        return;
      }
      this.dataUrl.set(result);
      this.mimeType.set(file.type);
      this.fileSize.set(file.size);
      this.fileName.set(file.name);
      this.processing.set(false);
    };
    reader.onerror = () => {
      this.error.set(this.t('labels.encodeFailed'));
      this.processing.set(false);
    };
    reader.readAsDataURL(file);
  }

  formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val >= 100 ? Math.round(val) : Math.round(val * 10) / 10} ${units[i]}`;
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
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
