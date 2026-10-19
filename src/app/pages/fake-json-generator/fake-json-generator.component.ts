import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-fake-json-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './fake-json-generator.component.html',
  styleUrl: './fake-json-generator.component.scss',
})
export class FakeJsonGeneratorComponent implements OnDestroy {
  readonly slug = 'fake-json-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['yaml-to-json', 'xml-to-json', 'regex-tester'];

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

  readonly template = signal<'user' | 'product' | 'order' | 'post'>('user');
  readonly count = signal(5);
  readonly seed = signal(7);
  readonly copied = signal(false);

  setTemplate(t: 'user' | 'product' | 'order' | 'post'): void {
    this.template.set(t);
  }

  setCount(v: number): void {
    this.count.set(this.clampNum(v, 1, 50));
  }

  regenerate(): void {
    this.seed.update((s) => s + 1);
  }

  private rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private pick<T>(rand: () => number, arr: T[]): T {
    return arr[Math.floor(rand() * arr.length)];
  }

  readonly json = computed(() => {
    const rand = this.rng(this.seed() * 7919 + 13);
    const n = this.count();
    const t = this.template();
    const first = ['Aarav', 'Sana', 'Kabir', 'Meera', 'Arjun', 'Zara', 'Rohan', 'Isha', 'Vikram', 'Anaya'];
    const last = ['Sharma', 'Khan', 'Patel', 'Iyer', 'Gupta', 'Singh', 'Nair', 'Das', 'Kulkarni', 'Azmi'];
    const cities = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Jaipur', 'Kolkata', 'Chennai', 'Pune'];
    const products = ['Wireless Mouse', 'USB-C Cable', 'Notebook Set', 'Desk Lamp', 'Water Bottle', 'Backpack', 'Keyboard', 'Phone Stand'];
    const categories = ['Electronics', 'Stationery', 'Home', 'Accessories'];
    const words = ['quick', 'bright', 'silent', 'clever', 'happy', 'swift', 'calm', 'bold', 'fresh', 'smart'];
    const items: unknown[] = [];
    for (let i = 0; i < n; i++) {
      const id = i + 1;
      if (t === 'user') {
        const fn = this.pick(rand, first);
        const ln = this.pick(rand, last);
        items.push({
          id,
          name: `${fn} ${ln}`,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(rand() * 90 + 10)}@example.com`,
          age: Math.floor(rand() * 43 + 18),
          city: this.pick(rand, cities),
          active: rand() > 0.3,
        });
      } else if (t === 'product') {
        items.push({
          id,
          sku: 'SKU-' + Math.floor(rand() * 90000 + 10000),
          name: this.pick(rand, products),
          category: this.pick(rand, categories),
          price: Math.round((rand() * 490 + 10) * 100) / 100,
          inStock: Math.floor(rand() * 200),
        });
      } else if (t === 'order') {
        items.push({
          id: 'ORD-' + (1000 + i),
          userId: Math.floor(rand() * n) + 1,
          total: Math.round((rand() * 9900 + 100) * 100) / 100,
          status: this.pick(rand, ['pending', 'shipped', 'delivered', 'cancelled']),
          items: Math.floor(rand() * 5 + 1),
        });
      } else {
        items.push({
          id,
          title: 'How to ' + this.pick(rand, words) + ' your ' + this.pick(rand, words) + ' workflow',
          authorId: Math.floor(rand() * n) + 1,
          views: Math.floor(rand() * 50000),
          published: rand() > 0.4,
        });
      }
    }
    return JSON.stringify(items, null, 2);
  });

  readonly charCount = computed(() => this.json().length);

  copyJson(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.json())
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadJson(): void {
    const blob = new Blob([this.json()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'mock-data.json';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
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
