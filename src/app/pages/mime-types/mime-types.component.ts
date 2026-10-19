import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-mime-types',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './mime-types.component.html',
  styleUrl: './mime-types.component.scss',
})
export class MimeTypesComponent implements OnDestroy {
  readonly slug = 'mime-types';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['url-parser', 'responsive-website-tester', 'bimi-svg-validator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly query = signal('');
  readonly copiedMime = signal('');

  setQuery(v: string): void {
    this.query.set(v.slice(0, 80));
  }

  private readonly db: { ext: string; mime: string; kind: string }[] = [
    { ext: 'html', mime: 'text/html', kind: 'Web page' },
    { ext: 'css', mime: 'text/css', kind: 'Stylesheet' },
    { ext: 'js', mime: 'text/javascript', kind: 'JavaScript' },
    { ext: 'mjs', mime: 'text/javascript', kind: 'JavaScript module' },
    { ext: 'json', mime: 'application/json', kind: 'JSON data' },
    { ext: 'xml', mime: 'application/xml', kind: 'XML data' },
    { ext: 'svg', mime: 'image/svg+xml', kind: 'Vector image' },
    { ext: 'png', mime: 'image/png', kind: 'Image' },
    { ext: 'jpg', mime: 'image/jpeg', kind: 'Image' },
    { ext: 'jpeg', mime: 'image/jpeg', kind: 'Image' },
    { ext: 'gif', mime: 'image/gif', kind: 'Image' },
    { ext: 'webp', mime: 'image/webp', kind: 'Image' },
    { ext: 'avif', mime: 'image/avif', kind: 'Image' },
    { ext: 'ico', mime: 'image/x-icon', kind: 'Icon' },
    { ext: 'bmp', mime: 'image/bmp', kind: 'Image' },
    { ext: 'tiff', mime: 'image/tiff', kind: 'Image' },
    { ext: 'mp3', mime: 'audio/mpeg', kind: 'Audio' },
    { ext: 'wav', mime: 'audio/wav', kind: 'Audio' },
    { ext: 'ogg', mime: 'audio/ogg', kind: 'Audio' },
    { ext: 'm4a', mime: 'audio/mp4', kind: 'Audio' },
    { ext: 'flac', mime: 'audio/flac', kind: 'Audio' },
    { ext: 'mp4', mime: 'video/mp4', kind: 'Video' },
    { ext: 'webm', mime: 'video/webm', kind: 'Video' },
    { ext: 'mov', mime: 'video/quicktime', kind: 'Video' },
    { ext: 'avi', mime: 'video/x-msvideo', kind: 'Video' },
    { ext: 'mkv', mime: 'video/x-matroska', kind: 'Video' },
    { ext: 'pdf', mime: 'application/pdf', kind: 'Document' },
    { ext: 'doc', mime: 'application/msword', kind: 'Document' },
    { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'Document' },
    { ext: 'xls', mime: 'application/vnd.ms-excel', kind: 'Spreadsheet' },
    { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'Spreadsheet' },
    { ext: 'ppt', mime: 'application/vnd.ms-powerpoint', kind: 'Presentation' },
    { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'Presentation' },
    { ext: 'txt', mime: 'text/plain', kind: 'Plain text' },
    { ext: 'md', mime: 'text/markdown', kind: 'Markdown' },
    { ext: 'csv', mime: 'text/csv', kind: 'Spreadsheet' },
    { ext: 'rtf', mime: 'application/rtf', kind: 'Document' },
    { ext: 'zip', mime: 'application/zip', kind: 'Archive' },
    { ext: 'rar', mime: 'application/vnd.rar', kind: 'Archive' },
    { ext: '7z', mime: 'application/x-7z-compressed', kind: 'Archive' },
    { ext: 'tar', mime: 'application/x-tar', kind: 'Archive' },
    { ext: 'gz', mime: 'application/gzip', kind: 'Archive' },
    { ext: 'woff', mime: 'font/woff', kind: 'Font' },
    { ext: 'woff2', mime: 'font/woff2', kind: 'Font' },
    { ext: 'ttf', mime: 'font/ttf', kind: 'Font' },
    { ext: 'otf', mime: 'font/otf', kind: 'Font' },
    { ext: 'eot', mime: 'application/vnd.ms-fontobject', kind: 'Font' },
    { ext: 'wasm', mime: 'application/wasm', kind: 'WebAssembly' },
    { ext: 'yaml', mime: 'application/yaml', kind: 'Data' },
    { ext: 'yml', mime: 'application/yaml', kind: 'Data' },
    { ext: 'toml', mime: 'application/toml', kind: 'Data' },
    { ext: 'sqlite', mime: 'application/vnd.sqlite3', kind: 'Database' },
    { ext: 'db', mime: 'application/octet-stream', kind: 'Database' },
    { ext: 'bin', mime: 'application/octet-stream', kind: 'Binary' },
    { ext: 'exe', mime: 'application/x-msdownload', kind: 'Executable' },
    { ext: 'dmg', mime: 'application/x-apple-diskimage', kind: 'Disk image' },
    { ext: 'iso', mime: 'application/x-iso9660-image', kind: 'Disk image' },
    { ext: 'apk', mime: 'application/vnd.android.package-archive', kind: 'Android app' },
    { ext: 'epub', mime: 'application/epub+zip', kind: 'E-book' },
    { ext: 'ics', mime: 'text/calendar', kind: 'Calendar' },
    { ext: 'vcf', mime: 'text/vcard', kind: 'Contact' },
    { ext: 'eml', mime: 'message/rfc822', kind: 'Email' },
    { ext: 'rss', mime: 'application/rss+xml', kind: 'Feed' },
    { ext: 'atom', mime: 'application/atom+xml', kind: 'Feed' },
    { ext: 'graphql', mime: 'application/graphql', kind: 'API' },
    { ext: 'pem', mime: 'application/x-pem-file', kind: 'Certificate' },
    { ext: 'crt', mime: 'application/x-x509-ca-cert', kind: 'Certificate' },
  ];

  readonly results = computed(() => {
    const q = this.query().trim().toLowerCase().replace(/^\./, '');
    if (!q) return this.db.slice(0, 20);
    return this.db
      .filter((m) => m.ext.includes(q) || m.mime.toLowerCase().includes(q) || m.kind.toLowerCase().includes(q))
      .slice(0, 100);
  });

  copyMime(mime: string): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(mime)
      .then(() => {
        this.copiedMime.set(mime);
        setTimeout(() => this.copiedMime.set(''), 1600);
      })
      ;
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

  ngOnDestroy() {
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
