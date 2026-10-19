import { Component, computed, effect, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

@Component({
  selector: 'app-ulid-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './ulid-generator.component.html',
  styleUrl: './ulid-generator.component.scss',
})
export class UlidGeneratorComponent implements OnDestroy {
  readonly slug = 'ulid-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['uuid-generator', 'wifi-qr-code-generator', 'utm-builder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly count = signal(5);
  readonly ids = signal<string[]>([]);
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

  readonly idRows = computed(() =>
    this.ids().map((id) => ({ id, time: this.decodeTime(id) })),
  );

  private readonly timeFmt = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'medium' }),
  );

  /** Labeled anatomy of the first ULID: 10-char timestamp + 16-char randomness. */
  readonly bitGroups = computed(() => {
    const id = this.ids()[0];
    if (!id || id.length !== 26) return [];
    return [
      { text: id.slice(0, 10), tag: 'bitTimestamp', cls: 'bit-version' },
      { text: id.slice(10), tag: 'bitRandom', cls: '' },
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
      this.count.set(100);
      this.generate();
    }
  }

  downloadCsv(): void {
    const body = 'index,ulid\n' + this.ids().map((id, i) => `${i + 1},${id}`).join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'ulids.csv';
    a.click();
    URL.revokeObjectURL(url);
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

  formatTime(ms: number): string {
    return this.timeFmt().format(ms);
  }

  setCount(v: number) {
    this.count.set(this.clampNum(v, 1, 100));
  }

  generate() {
    const out: string[] = [];
    for (let i = 0; i < this.count(); i++) out.push(this.makeUlid());
    this.ids.set(out);
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
    a.download = 'ulids.txt';
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

  private makeUlid(): string {
    let t = Date.now();
    let ts = '';
    for (let i = 0; i < 10; i++) {
      ts = CROCKFORD.charAt(t % 32) + ts;
      t = Math.floor(t / 32);
    }
    const rand = new Uint8Array(10);
    crypto.getRandomValues(rand);
    let big = 0n;
    for (const b of rand) big = (big << 8n) | BigInt(b);
    let r = '';
    for (let i = 0; i < 16; i++) {
      r = CROCKFORD.charAt(Number(big & 31n)) + r;
      big >>= 5n;
    }
    return ts + r;
  }

  private decodeTime(ulid: string): number {
    let v = 0;
    for (let i = 0; i < 10; i++) v = v * 32 + CROCKFORD.indexOf(ulid.charAt(i).toUpperCase());
    return v;
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
