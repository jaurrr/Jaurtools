import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-tile-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './tile-calculator.component.html',
  styleUrl: './tile-calculator.component.scss',
})
export class TileCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.tilesToBuy());
  copyMain(): void {
    const text = String(this.copyText());
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'tile-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['roofing-calculator', 'stair-calculator', 'reorder-point-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);


  readonly floorL = signal(4);
  readonly floorW = signal(5);
  readonly tileL = signal(60);
  readonly tileW = signal(60);
  readonly perBox = signal(4);
  readonly waste = signal(10);
  readonly price = signal(2.5);

  readonly floorArea = computed(() => this.floorL() * this.floorW());
  readonly tileArea = computed(() => (this.tileL() / 100) * (this.tileW() / 100));
  readonly tilesExact = computed(() => {
    const ta = this.tileArea();
    return ta > 0 ? this.floorArea() / ta : 0;
  });
  readonly tilesToBuy = computed(() => Math.ceil(this.tilesExact() * (1 + this.waste() / 100)));
  readonly boxes = computed(() => {
    const pb = this.perBox();
    return pb > 0 ? Math.ceil(this.tilesToBuy() / pb) : 0;
  });
  readonly cost = computed(() => this.tilesToBuy() * this.price());

  readonly fmt1 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
  );
  readonly fmt2 = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );

  setFloorL(v: number) { this.floorL.set(this.clampNum(v, 0.5, 500)); }
  setFloorW(v: number) { this.floorW.set(this.clampNum(v, 0.5, 500)); }
  setTileL(v: number) { this.tileL.set(this.clampNum(v, 5, 200)); }
  setTileW(v: number) { this.tileW.set(this.clampNum(v, 5, 200)); }
  setPerBox(v: number) { this.perBox.set(this.clampNum(v, 1, 100)); }
  setWaste(v: number) { this.waste.set(this.clampNum(v, 0, 50)); }
  setPrice(v: number) { this.price.set(this.clampNum(v, 0, 100000)); }


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
      .replace(/</g, '\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
