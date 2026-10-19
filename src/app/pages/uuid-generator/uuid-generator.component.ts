import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface BitGroup {
  text: string;
  tag: 'bitRandom' | 'bitVersion' | 'bitVariant';
  cls: string;
}
@Component({
  selector: 'app-uuid-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './uuid-generator.component.html',
  styleUrl: './uuid-generator.component.scss',
})
export class UuidGeneratorComponent implements OnDestroy {
  readonly slug = 'uuid-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ulid-generator', 'wifi-qr-code-generator', 'utm-builder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly count = signal(5);
  readonly uppercase = signal(false);
  readonly braces = signal(false);
  readonly noHyphens = signal(false);
  private readonly rawIds = signal<string[]>([]);
  readonly copiedIndex = signal(-1);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
    this.generate();
  }

  readonly ids = computed(() =>
    this.rawIds().map((id) => {
      let out = id;
      if (this.noHyphens()) out = out.replace(/-/g, '');
      if (this.uppercase()) out = out.toUpperCase();
      if (this.braces()) out = '{' + out + '}';
      return out;
    }),
  );

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  /** Labeled bit-breakdown of the first generated UUID (v4 layout). */
  readonly bitGroups = computed((): BitGroup[] => {
    const raw = this.rawIds()[0];
    if (!raw) return [];
    const hex = raw.replace(/-/g, '');
    if (hex.length !== 32) return [];
    return [
      { text: hex.slice(0, 8), tag: 'bitRandom', cls: '' },
      { text: hex.slice(8, 12), tag: 'bitRandom', cls: '' },
      { text: hex.slice(12, 13), tag: 'bitVersion', cls: 'bit-version' },
      { text: hex.slice(13, 16), tag: 'bitRandom', cls: '' },
      { text: hex.slice(16, 17), tag: 'bitVariant', cls: 'bit-variant' },
      { text: hex.slice(17, 20), tag: 'bitRandom', cls: '' },
      { text: hex.slice(20, 32), tag: 'bitRandom', cls: '' },
    ];
  });

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'c') this.copyAll();
    else if (key === 'r') this.generate();
    else if (key === 'g') {
      this.setCount(100);
      this.generate();
    }
  }

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

  setCount(v: number) {
    this.count.set(this.clampNum(v, 1, 100));
  }

  generate() {
    const out: string[] = [];
    for (let i = 0; i < this.count(); i++) out.push(crypto.randomUUID());
    this.rawIds.set(out);
    this.copiedIndex.set(-1);
  }

  copyOne(i: number) {
    const id = this.ids()[i];
    if (!id) return;
    navigator.clipboard
      .writeText(id)
      .then(() => {
        this.copiedIndex.set(i);
        if (this.copyTimer) clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => this.copiedIndex.set(-1), 1500);
      })
      ;
  }

  copyAll() {
    navigator.clipboard.writeText(this.ids().join('\n')).catch(() => undefined);
  }

  download() {
    const blob = new Blob([this.ids().join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'uuids.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadCsv() {
    const body = 'index,uuid\n' + this.ids().map((id, i) => `${i + 1},"${id}"`).join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'uuids.csv';
    a.click();
    URL.revokeObjectURL(url);
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
    return Math.min(max, Math.max(min, Math.round(v)));
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
    for (const l of ['en', 'hi', 'ar']) this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
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
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
      .replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
