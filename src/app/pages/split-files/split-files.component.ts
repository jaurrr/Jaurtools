import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface FilePart {
  index: number;
  name: string;
  size: number;
}

@Component({
  selector: 'app-split-files',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './split-files.component.html',
  styleUrl: './split-files.component.scss',
})
export class SplitFilesComponent implements OnDestroy {
  readonly slug = 'split-files';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sql-to-json', 'xml-to-csv', 'xml-to-excel'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly file = signal<File | null>(null);
  readonly mode = signal<'size' | 'count'>('size');
  readonly chunkMB = signal(10);
  readonly partCount = signal(4);
  readonly errorMsg = signal('');

  private blobUrls: string[] = [];
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly chunkBytes = computed(() => {
    if (this.mode() === 'size') {
      return Math.max(1, Math.round(this.chunkMB())) * 1024 * 1024;
    }
    const f = this.file();
    if (!f || f.size === 0) return 0;
    return Math.ceil(f.size / Math.max(2, Math.round(this.partCount())));
  });

  readonly parts = computed<FilePart[]>(() => {
    const f = this.file();
    if (!f || f.size === 0) return [];
    const chunk = this.chunkBytes();
    if (chunk <= 0) return [];
    const total = Math.max(1, Math.ceil(f.size / chunk));
    return Array.from({ length: total }, (_, i) => {
      const start = i * chunk;
      const end = Math.min(start + chunk, f.size);
      return { index: i + 1, name: this.partName(f.name, i + 1, total), size: end - start };
    });
  });

  readonly numFormat = computed(
    () => new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 })
  );

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

  formatBytes(bytes: number): string {
    const fmt = this.numFormat();
    if (bytes < 1024) return `${fmt.format(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${fmt.format(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${fmt.format(mb)} MB`;
    return `${fmt.format(mb / 1024)} GB`;
  }

  setMode(m: 'size' | 'count') {
    this.mode.set(m);
  }
  setChunkMB(v: number) {
    this.chunkMB.set(this.clampNum(v, 1, 1000));
  }
  setPartCount(v: number) {
    this.partCount.set(this.clampNum(v, 2, 200));
  }

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files && input.files[0];
    this.clearUrls();
    if (!f) {
      this.file.set(null);
      return;
    }
    if (f.size > 2 * 1024 * 1024 * 1024) {
      this.errorMsg.set(this.t('labels.errorTooLarge'));
      this.file.set(null);
      input.value = '';
      return;
    }
    this.errorMsg.set('');
    this.file.set(f);
  }

  clearFile() {
    this.file.set(null);
    this.errorMsg.set('');
    this.clearUrls();
  }

  downloadPart(i: number) {
    const f = this.file();
    const p = this.parts()[i];
    if (!f || !p) return;
    const chunk = this.chunkBytes();
    const start = i * chunk;
    const end = Math.min(start + chunk, f.size);
    const blob = f.slice(start, end, f.type || 'application/octet-stream');
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = p.name;
    this.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  downloadAll() {
    const n = this.parts().length;
    for (let i = 0; i < n; i++) this.downloadPart(i);
  }

  ngOnDestroy() {
    this.clearUrls();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private partName(name: string, i: number, total: number): string {
    const pad = String(total).length;
    const n = String(i).padStart(pad, '0');
    const dot = name.lastIndexOf('.');
    if (dot > 0) return `${name.slice(0, dot)}_part${n}${name.slice(dot)}`;
    return `${name}_part${n}`;
  }

  private clearUrls() {
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
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
