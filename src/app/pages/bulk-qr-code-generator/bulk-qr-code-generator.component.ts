import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import QRCode from 'qrcode';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type EcLevel = 'L' | 'M' | 'Q' | 'H';

interface QrItem {
  text: string;
  url: string;
  failed: boolean;
}

const MAX_ITEMS = 50;

@Component({
  selector: 'app-bulk-qr-code-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './bulk-qr-code-generator.component.html',
  styleUrl: './bulk-qr-code-generator.component.scss',
})
export class BulkQrCodeGeneratorComponent implements OnDestroy {
  readonly slug = 'bulk-qr-code-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['barcode-generator', 'qr-code-scanner', 'qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal('https://jaurtools.com\nhttps://example.com/menu\nTABLE-12');
  readonly ecLevel = signal<EcLevel>('M');
  readonly size = signal(512);
  readonly items = signal<QrItem[]>([]);
  readonly generating = signal(false);
  readonly trimmed = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly lineCount = computed(() => {
    return this.input().split('\n').map((l) => l.trim()).filter((l) => l.length > 0).length;
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

  setInput(v: string): void {
    this.input.set(v);
  }

  setEcLevel(v: EcLevel): void {
    this.ecLevel.set(v);
  }

  setSize(v: number): void {
    this.size.set(v);
  }

  async generate(): Promise<void> {
    if (this.generating()) return;
    const lines = this.input().split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    this.trimmed.set(lines.length > MAX_ITEMS);
    const batch = lines.slice(0, MAX_ITEMS);
    this.generating.set(true);
    try {
      const results = await Promise.all(
        batch.map(async (text): Promise<QrItem> => {
          try {
            const url = await QRCode.toDataURL(text, {
              errorCorrectionLevel: this.ecLevel(),
              width: this.size(),
              margin: 2,
            });
            return { text, url, failed: false };
          } catch {
            return { text, url: '', failed: true };
          }
        }),
      );
      this.items.set(results);
    } finally {
      this.generating.set(false);
    }
  }

  clear(): void {
    this.items.set([]);
    this.trimmed.set(false);
  }

  downloadItem(item: QrItem, index: number): void {
    const a = this.document.createElement('a');
    a.href = item.url;
    a.download = `qr-${index + 1}.png`;
    a.click();
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
