import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-biodata-maker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './biodata-maker.component.html',
  styleUrl: './biodata-maker.component.scss',
})
export class BiodataMakerComponent implements OnDestroy {
  readonly slug = 'biodata-maker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['resume-builder', 'quotation-generator', 'emergency-contact-card-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fullName = signal('Aarav Sharma');
  readonly dateOfBirth = signal('1998-05-14');
  readonly height = signal('5 ft 9 in');
  readonly maritalStatus = signal<'single' | 'married'>('single');
  readonly education = signal('B.Com, Delhi University');
  readonly occupation = signal('Accountant');
  readonly annualIncome = signal('INR 6,00,000');
  readonly fatherName = signal('Rajesh Sharma');
  readonly motherName = signal('Sunita Sharma');
  readonly address = signal('New Delhi, India');
  readonly phone = signal('+91 98765 43210');
  readonly email = signal('aarav@example.com');
  readonly about = signal('A simple, family-oriented person who values honesty and respect.');
  readonly expectations = signal('Looking for an educated, kind-hearted partner from a respectable family.');
  readonly generating = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly personalRows = computed(() => [
    { k: this.t('labels.dateOfBirth'), v: this.dateOfBirth() },
    { k: this.t('labels.height'), v: this.height() },
    { k: this.t('labels.maritalStatus'), v: this.t('labels.' + (this.maritalStatus() === 'single' ? 'statusSingle' : 'statusMarried')) },
    { k: this.t('labels.education'), v: this.education() },
    { k: this.t('labels.occupation'), v: this.occupation() },
    { k: this.t('labels.annualIncome'), v: this.annualIncome() },
  ]);

  readonly familyRows = computed(() => [
    { k: this.t('labels.fatherName'), v: this.fatherName() },
    { k: this.t('labels.motherName'), v: this.motherName() },
  ]);

  readonly contactRows = computed(() => [
    { k: this.t('labels.address'), v: this.address() },
    { k: this.t('labels.phone'), v: this.phone() },
    { k: this.t('labels.email'), v: this.email() },
  ]);

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

  setMaritalStatus(v: 'single' | 'married'): void {
    this.maritalStatus.set(v);
  }

  // The PDF standard fonts only cover Latin script, so every label drawn
  // into the PDF stays English even on the Hindi/Arabic pages.
  private pdfLabel(key: string): string {
    const en: Record<string, string> = {
      pdfTitle: 'Biodata',
      personalHeading: 'Personal details',
      familyHeading: 'Family',
      contactHeading: 'Contact',
      aboutHeading: 'About me',
      expectationsHeading: 'Partner expectations',
      dateOfBirth: 'Date of birth',
      height: 'Height',
      maritalStatus: 'Marital status',
      statusSingle: 'Single',
      statusMarried: 'Married',
      education: 'Education',
      occupation: 'Occupation',
      annualIncome: 'Annual income',
      fatherName: "Father's name",
      motherName: "Mother's name",
      address: 'Address',
      phone: 'Phone',
      email: 'Email',
    };
    return en[key] ?? key;
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

      const writeLine = (text: string, f: PDFFont, size: number, color = ink, indent = 0) => {
        for (const line of this.wrap(text, f, size, 595 - margin * 2 - indent)) {
          if (y < 60) return;
          page.drawText(line, { x: margin + indent, y, size, font: f, color });
          y -= size + 6;
        }
      };

      page.drawText(this.pdfLabel('pdfTitle'), { x: margin, y, size: 26, font: bold, color: accent });
      y -= 34;
      writeLine(this.fullName(), bold, 16);
      y -= 8;
      const sections: { title: string; rows: { k: string; v: string }[] }[] = [
        {
          title: this.pdfLabel('personalHeading'),
          rows: [
            { k: this.pdfLabel('dateOfBirth'), v: this.dateOfBirth() },
            { k: this.pdfLabel('height'), v: this.height() },
            { k: this.pdfLabel('maritalStatus'), v: this.pdfLabel(this.maritalStatus() === 'single' ? 'statusSingle' : 'statusMarried') },
            { k: this.pdfLabel('education'), v: this.education() },
            { k: this.pdfLabel('occupation'), v: this.occupation() },
            { k: this.pdfLabel('annualIncome'), v: this.annualIncome() },
          ],
        },
        {
          title: this.pdfLabel('familyHeading'),
          rows: [
            { k: this.pdfLabel('fatherName'), v: this.fatherName() },
            { k: this.pdfLabel('motherName'), v: this.motherName() },
          ],
        },
        {
          title: this.pdfLabel('contactHeading'),
          rows: [
            { k: this.pdfLabel('address'), v: this.address() },
            { k: this.pdfLabel('phone'), v: this.phone() },
            { k: this.pdfLabel('email'), v: this.email() },
          ],
        },
      ];
      for (const s of sections) {
        y -= 6;
        writeLine(s.title, bold, 13, accent);
        for (const r of s.rows) {
          if (r.v.trim()) writeLine(`${r.k}: ${r.v}`, font, 11, ink, 8);
        }
      }
      if (this.about().trim()) {
        y -= 6;
        writeLine(this.pdfLabel('aboutHeading'), bold, 13, accent);
        writeLine(this.about(), font, 11, ink, 8);
      }
      if (this.expectations().trim()) {
        y -= 6;
        writeLine(this.pdfLabel('expectationsHeading'), bold, 13, accent);
        writeLine(this.expectations(), font, 11, ink, 8);
      }

      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = url;
      a.download = 'biodata.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      this.generating.set(false);
    }
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
