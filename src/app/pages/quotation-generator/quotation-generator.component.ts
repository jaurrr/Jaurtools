import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface QuoteItem {
  desc: string;
  qty: number;
  rate: number;
}

@Component({
  selector: 'app-quotation-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './quotation-generator.component.html',
  styleUrl: './quotation-generator.component.scss',
})
export class QuotationGeneratorComponent implements OnDestroy {
  readonly slug = 'quotation-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['resume-builder', 'biodata-maker', 'emergency-contact-card-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly businessName = signal('Jauhar Web Studio');
  readonly businessPhone = signal('+91 98765 43210');
  readonly businessAddress = signal('Hyderabad, India');
  readonly clientName = signal('ABC Traders');
  readonly clientAddress = signal('Mumbai, India');
  readonly quoteNo = signal('Q-2026-001');
  readonly quoteDate = signal('2026-10-18');
  readonly validDays = signal(15);
  readonly currency = signal('₹');
  readonly taxPct = signal(18);
  readonly discountPct = signal(10);
  readonly items = signal<QuoteItem[]>([
    { desc: 'Website design', qty: 1, rate: 25000 },
    { desc: 'Logo design', qty: 1, rate: 5000 },
  ]);
  readonly generating = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly subtotal = computed(() =>
    this.items().reduce((s, it) => s + it.qty * it.rate, 0),
  );
  readonly discountAmt = computed(() => (this.subtotal() * this.discountPct()) / 100);
  readonly taxable = computed(() => this.subtotal() - this.discountAmt());
  readonly taxAmt = computed(() => (this.taxable() * this.taxPct()) / 100);
  readonly total = computed(() => this.taxable() + this.taxAmt());

  readonly money = computed(() =>
    new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

  addItem(): void {
    this.items.update((list) => [...list, { desc: '', qty: 1, rate: 0 }]);
  }

  removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  updateItem(index: number, patch: Partial<QuoteItem>): void {
    this.items.update((list) =>
      list.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }

  setQty(index: number, v: number): void {
    this.updateItem(index, { qty: Math.max(0, Math.round((Number(v) || 0) * 100) / 100) });
  }

  setRate(index: number, v: number): void {
    this.updateItem(index, { rate: Math.max(0, Math.round((Number(v) || 0) * 100) / 100) });
  }

  setTaxPct(v: number): void {
    const n = Number(v);
    this.taxPct.set(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  }

  setDiscountPct(v: number): void {
    const n = Number(v);
    this.discountPct.set(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  }

  setValidDays(v: number): void {
    this.validDays.set(Math.min(365, Math.max(1, Math.round(Number(v)) || 1)));
  }

  lineTotal(it: QuoteItem): number {
    return it.qty * it.rate;
  }

  async downloadPdf(): Promise<void> {
    if (this.generating()) return;
    this.generating.set(true);
    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([595, 842]);
      const margin = 50;
      let y = 792;
      const ink = rgb(0.06, 0.09, 0.16);
      const accent = rgb(0.31, 0.27, 0.9);
      const cur = this.currency();

      const write = (text: string, f: PDFFont, size: number, color = ink, indent = 0) => {
        for (const line of this.wrap(text, f, size, 595 - margin * 2 - indent)) {
          if (y < 60) return;
          page.drawText(line, { x: margin + indent, y, size, font: f, color });
          y -= size + 6;
        }
      };
      const money = (n: number) => `${cur} ${n.toFixed(2)}`;

      write(this.pdfLabel('pdfTitle'), bold, 24, accent);
      write(this.businessName(), bold, 14);
      write(`${this.businessPhone()}  ${this.businessAddress()}`, font, 10);
      y -= 8;
      write(`${this.pdfLabel('quoteNo')}: ${this.quoteNo()}`, bold, 11);
      write(`${this.pdfLabel('quoteDate')}: ${this.quoteDate()}`, font, 11);
      write(`${this.pdfLabel('clientHeading')}: ${this.clientName()}`, font, 11);
      if (this.clientAddress().trim()) write(this.clientAddress(), font, 10, ink, 8);
      y -= 8;

      for (const it of this.items()) {
        if (y < 120) break;
        const desc = it.desc || '-';
        write(`${desc}  x ${it.qty}`, font, 11);
        page.drawText(money(this.lineTotal(it)), { x: 595 - margin - 110, y: y + 17, size: 11, font, color: ink });
      }
      y -= 10;
      write(`${this.pdfLabel('subtotal')}: ${money(this.subtotal())}`, font, 11);
      if (this.discountPct() > 0) write(`${this.pdfLabel('discountAmt')} (${this.discountPct()}%): -${money(this.discountAmt())}`, font, 11);
      if (this.taxPct() > 0) write(`${this.pdfLabel('taxAmt')} (${this.taxPct()}%): ${money(this.taxAmt())}`, font, 11);
      write(`${this.pdfLabel('total')}: ${money(this.total())}`, bold, 14, accent);
      y -= 6;
      write(`${this.pdfLabel('validDays')}: ${this.validDays()}`, font, 10);

      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = url;
      a.download = 'quotation.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      this.generating.set(false);
    }
  }

  // The PDF standard fonts only cover Latin script, so every label drawn
  // into the PDF stays English even on the Hindi/Arabic pages.
  private pdfLabel(key: string): string {
    const en: Record<string, string> = {
      pdfTitle: 'Quotation',
      quoteNo: 'Quote no.',
      quoteDate: 'Date',
      clientHeading: 'Client and quote details',
      subtotal: 'Subtotal',
      discountAmt: 'Discount',
      taxAmt: 'Tax',
      total: 'Total',
      validDays: 'Valid (days)',
    };
    return en[key] ?? key;
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
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
