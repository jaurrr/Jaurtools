import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface InvoiceItem {
  desc: string;
  qty: number;
  rate: number;
}

const UI_CURRENCY: Record<string, string> = {
  USD: '$',
  EUR: '€',
  INR: '₹',
  GBP: '£',
  SAR: 'ر.س',
};
const PDF_CURRENCY: Record<string, string> = {
  USD: '$',
  EUR: 'EUR ',
  INR: 'Rs. ',
  GBP: 'GBP ',
  SAR: 'SAR ',
};

@Component({
  selector: 'app-invoice-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './invoice-generator.component.html',
  styleUrl: './invoice-generator.component.scss',
})
export class InvoiceGeneratorComponent implements OnDestroy {
  readonly slug = 'invoice-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['money-counter', 'margin-calculator', 'million-billion-converter', 'percentage-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly businessName = signal('');
  readonly clientName = signal('');
  readonly invoiceNo = signal('INV-001');
  readonly invoiceDate = signal('2026-10-18');
  readonly currency = signal('USD');
  readonly taxRate = signal(0);
  readonly discountRate = signal(0);
  readonly items = signal<InvoiceItem[]>([{ desc: '', qty: 1, rate: 0 }]);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly currencySymbol = computed(() => UI_CURRENCY[this.currency()] ?? '$');
  readonly subtotal = computed(() => this.items().reduce((s, it) => s + it.qty * it.rate, 0));
  readonly discountAmt = computed(() => (this.subtotal() * this.discountRate()) / 100);
  readonly taxable = computed(() => this.subtotal() - this.discountAmt());
  readonly taxAmt = computed(() => (this.taxable() * this.taxRate()) / 100);
  readonly total = computed(() => this.taxable() + this.taxAmt());

  readonly moneyFmt = computed(
    () =>
      new Intl.NumberFormat(this.locale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
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

  setBusinessName(v: string) {
    this.businessName.set(v);
  }
  setClientName(v: string) {
    this.clientName.set(v);
  }
  setInvoiceNo(v: string) {
    this.invoiceNo.set(v);
  }
  setInvoiceDate(v: string) {
    this.invoiceDate.set(v);
  }
  setCurrency(v: string) {
    this.currency.set(v);
  }
  setTaxRate(v: number) {
    this.taxRate.set(this.clampNum(v, 0, 100));
  }
  setDiscountRate(v: number) {
    this.discountRate.set(this.clampNum(v, 0, 100));
  }

  addItem() {
    this.items.update((list) => [...list, { desc: '', qty: 1, rate: 0 }]);
  }

  removeItem(i: number) {
    this.items.update((list) => (list.length > 1 ? list.filter((_, idx) => idx !== i) : list));
  }

  setItemDesc(i: number, v: string) {
    this.patchItem(i, { desc: v });
  }
  setItemQty(i: number, v: number) {
    this.patchItem(i, { qty: this.clampNum(v, 0, 1000000) });
  }
  setItemRate(i: number, v: number) {
    this.patchItem(i, { rate: this.clampNum(v, 0, 100000000) });
  }

  private patchItem(i: number, patch: Partial<InvoiceItem>) {
    this.items.update((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async downloadPdf() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const sym = PDF_CURRENCY[this.currency()] ?? '$';
    const money = (n: number) => sym + n.toFixed(2);
    const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, '?');
    let page = doc.addPage([612, 792]);
    let y = 752;
    const line = (text: string, x: number, size: number, f: PDFFont, gap = 7) => {
      if (y < 70) {
        page = doc.addPage([612, 792]);
        y = 752;
      }
      page.drawText(safe(text), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + gap;
    };
    line('INVOICE', 50, 22, bold, 10);
    line('Invoice No: ' + (this.invoiceNo() || 'INV-001'), 50, 11, font);
    line('Date: ' + (this.invoiceDate() || ''), 50, 11, font);
    line('From: ' + (this.businessName() || '-'), 50, 11, font);
    line('Bill to: ' + (this.clientName() || '-'), 50, 11, font, 14);
    line('Description                    Qty         Rate          Amount', 50, 11, bold, 9);
    for (const it of this.items()) {
      const desc = (it.desc || '-').slice(0, 28).padEnd(28, ' ');
      const row =
        desc + '  ' + String(it.qty).padEnd(10, ' ') + money(it.rate).padEnd(13, ' ') + money(it.qty * it.rate);
      line(row, 50, 10, font, 6);
    }
    y -= 8;
    line('Subtotal: ' + money(this.subtotal()), 380, 11, font);
    line('Discount (' + this.discountRate() + '%): -' + money(this.discountAmt()), 380, 11, font);
    line('Tax (' + this.taxRate() + '%): ' + money(this.taxAmt()), 380, 11, font);
    line('TOTAL DUE: ' + money(this.total()), 380, 13, bold);
    const bytes = await doc.save();
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = (this.invoiceNo() || 'invoice') + '.pdf';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
