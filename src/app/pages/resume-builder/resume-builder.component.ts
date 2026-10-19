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
  selector: 'app-resume-builder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './resume-builder.component.html',
  styleUrl: './resume-builder.component.scss',
})
export class ResumeBuilderComponent implements OnDestroy {
  readonly slug = 'resume-builder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['biodata-maker', 'quotation-generator', 'email-signature-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly fullName = signal('Jauhar Ayyub');
  readonly jobTitle = signal('Frontend Developer');
  readonly email = signal('jauhar@example.com');
  readonly phone = signal('+91 98765 43210');
  readonly location = signal('Hyderabad, India');
  readonly website = signal('https://example.com');
  readonly summary = signal('Frontend developer with 2 years of experience building responsive Angular applications. Strong in TypeScript, RxJS, and REST API integration.');
  readonly skills = signal('Angular, TypeScript, RxJS, HTML, CSS, SCSS, REST APIs, Git');
  readonly experience = signal('Frontend Developer, Digital Transformation Factory (2024-Present): Building a Manufacturing Execution System with Angular and PrimeNG.\nFreelance Web Developer (2023-2024): Delivered client websites including a travel documents portal.');
  readonly education = signal('BCA, Veer Bahadur Purvanchal University (2024)');
  readonly generating = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly skillsList = computed(() =>
    this.skills().split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 0),
  );

  readonly contactLine = computed(() =>
    [this.email(), this.phone(), this.location(), this.website()].filter((s) => s.trim()).join('  |  '),
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

  async downloadPdf(): Promise<void> {
    if (this.generating()) return;
    this.generating.set(true);
    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([595, 842]);
      const margin = 50;
      let y = 800;
      const ink = rgb(0.06, 0.09, 0.16);
      const accent = rgb(0.31, 0.27, 0.9);

      const write = (text: string, f: PDFFont, size: number, color = ink, indent = 0) => {
        for (const line of this.wrap(text, f, size, 595 - margin * 2 - indent)) {
          if (y < 60) return;
          page.drawText(line, { x: margin + indent, y, size, font: f, color });
          y -= size + 6;
        }
      };
      const section = (title: string, body: string) => {
        if (!body.trim()) return;
        y -= 4;
        write(title.toUpperCase(), bold, 12, accent);
        write(body, font, 11, ink, 4);
      };

      write(this.fullName(), bold, 22, accent);
      write(this.jobTitle(), bold, 13);
      write(this.contactLine(), font, 10);
      y -= 4;
      // PDF uses the Latin standard font, so section titles stay English
      // even when the page is viewed in Hindi or Arabic.
      section('Summary', this.summary());
      const skills = this.skillsList().join(', ');
      section('Skills', skills);
      section('Experience', this.experience());
      section('Education', this.education());

      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = this.document.createElement('a');
      a.href = url;
      a.download = 'resume.pdf';
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
