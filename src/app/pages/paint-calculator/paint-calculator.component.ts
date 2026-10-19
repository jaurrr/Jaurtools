import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const DOOR_M2 = 2.0;
const WINDOW_M2 = 1.5;
const WASTAGE = 1.1;
const CAN_SIZES = [20, 10, 4, 1];

@Component({
  selector: 'app-paint-calculator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './paint-calculator.component.html',
  styleUrl: './paint-calculator.component.scss',
})
export class PaintCalculatorComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.twoDecimal().format(this.litresNeeded()) + this.t('labels.lUnit'));
  copyMain(): void {
    const text = this.copyText();
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

  readonly slug = 'paint-calculator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['wind-chill-calculator', 'zoom-level-to-map-scale-calculator', 'online-whiteboard'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly roomLength = signal(4);
  readonly roomWidth = signal(3);
  readonly roomHeight = signal(3);
  readonly doors = signal(1);
  readonly windows = signal(0);
  readonly coats = signal(2);
  readonly coverage = signal(10);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly wallArea = computed(() => 2 * (this.roomLength() + this.roomWidth()) * this.roomHeight());
  readonly openingsArea = computed(() => this.doors() * DOOR_M2 + this.windows() * WINDOW_M2);
  readonly paintableArea = computed(() => Math.max(0, this.wallArea() - this.openingsArea()));
  readonly litresExact = computed(() => (this.paintableArea() * this.coats()) / this.coverage());
  readonly litresNeeded = computed(() => this.litresExact() * WASTAGE);

  readonly cans = computed(() => {
    let remaining = Math.ceil(this.litresNeeded());
    const out: { size: number; count: number }[] = [];
    for (const size of CAN_SIZES) {
      const count = Math.floor(remaining / size);
      if (count > 0) out.push({ size, count });
      remaining -= count * size;
    }
    return out;
  });

  readonly twoDecimal = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  setRoomLength(v: number) { this.roomLength.set(this.clampNum(v, 0.5, 100)); }
  setRoomWidth(v: number) { this.roomWidth.set(this.clampNum(v, 0.5, 100)); }
  setRoomHeight(v: number) { this.roomHeight.set(this.clampNum(v, 0.5, 20)); }
  setDoors(v: number) { this.doors.set(this.clampInt(v, 0, 20)); }
  setWindows(v: number) { this.windows.set(this.clampInt(v, 0, 20)); }
  setCoats(v: number) { this.coats.set(this.clampInt(v, 1, 5)); }
  setCoverage(v: number) { this.coverage.set(this.clampNum(v, 1, 30)); }

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

  private clampInt(v: number, min: number, max: number): number {
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
