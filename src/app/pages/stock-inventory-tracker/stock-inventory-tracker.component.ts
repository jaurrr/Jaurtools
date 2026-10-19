import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface StockItem {
  id: number;
  name: string;
  qty: number;
  cost: number;
  price: number;
  reorder: number;
}

const STORAGE_KEY = 'jaurtools-stock-inventory-v1';

@Component({
  selector: 'app-stock-inventory-tracker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './stock-inventory-tracker.component.html',
  styleUrl: './stock-inventory-tracker.component.scss',
})
export class StockInventoryTrackerComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.t('labels.currency') + this.money().format(this.totalValue()));
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

  readonly slug = 'stock-inventory-tracker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['fuel-range-calculator', 'attendance-percentage-calculator', 'report-card-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly items = signal<StockItem[]>([]);
  readonly name = signal('');
  readonly qty = signal(0);
  readonly cost = signal(0);
  readonly price = signal(0);
  readonly reorder = signal(5);
  readonly formError = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          this.items.set(
            parsed.filter(
              (p): p is StockItem =>
                typeof p === 'object' && p !== null &&
                typeof (p as StockItem).name === 'string' &&
                typeof (p as StockItem).qty === 'number'
            )
          );
        }
      }
    } catch {
      // storage unavailable; start empty
    }
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
      } catch {
        // storage unavailable; ignore
      }
    });
  }

  readonly totalValue = computed(() =>
    this.items().reduce((s, i) => s + i.qty * i.cost, 0)
  );
  readonly totalRevenue = computed(() =>
    this.items().reduce((s, i) => s + i.qty * i.price, 0)
  );
  readonly totalProfit = computed(() => this.totalRevenue() - this.totalValue());
  readonly itemCount = computed(() => this.items().length);
  readonly lowStock = computed(() =>
    this.items().filter((i) => i.qty <= i.reorder)
  );

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  itemValue(i: StockItem): number {
    return i.qty * i.cost;
  }

  setName(v: string): void { this.name.set(v.slice(0, 80)); }
  setQty(v: number): void { this.qty.set(this.clampNum(v, 0, 1000000)); }
  setCost(v: number): void { this.cost.set(this.clampNum(v, 0, 100000000)); }
  setPrice(v: number): void { this.price.set(this.clampNum(v, 0, 100000000)); }
  setReorder(v: number): void { this.reorder.set(this.clampNum(v, 0, 1000000)); }

  addItem(): void {
    if (!this.name().trim()) {
      this.formError.set(this.t('labels.errorName'));
      return;
    }
    this.formError.set('');
    const item: StockItem = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name: this.name().trim(),
      qty: this.qty(),
      cost: this.cost(),
      price: this.price(),
      reorder: this.reorder(),
    };
    this.items.update((list) => [...list, item]);
    this.name.set('');
    this.qty.set(0);
    this.cost.set(0);
    this.price.set(0);
  }

  removeItem(id: number): void {
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  exportCsv(): void {
    const cur = this.t('labels.currency');
    const rows = [
      'name,quantity,unit_cost_' + cur + ',unit_price_' + cur + ',reorder_level,stock_value',
      ...this.items().map((i) =>
        [i.name, i.qty, i.cost, i.price, i.reorder, this.itemValue(i)]
          .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'stock-inventory.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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

  ngOnDestroy(): void {
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
