import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

const LETTER_TYPES = ['job', 'leave', 'resignation', 'request'];

@Component({
  selector: 'app-application-letter-writer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './application-letter-writer.component.html',
  styleUrl: './application-letter-writer.component.scss',
})
export class ApplicationLetterWriterComponent implements OnDestroy {
  readonly slug = 'application-letter-writer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['award-certificate-generator', 'xml-sitemap-generator', 'utm-builder'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly letterType = signal('leave');
  readonly fullName = signal('');
  readonly address = signal('');
  readonly recipientName = signal('');
  readonly recipientRole = signal('');
  readonly organization = signal('');
  readonly subject = signal('');
  readonly points = signal('');
  readonly letterDate = signal(new Date().toISOString().slice(0, 10));
  readonly copied = signal(false);
  readonly letterTypes = LETTER_TYPES;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly letter = computed(() => {
    const L = (k: string) => this.t('labels.' + k);
    const pts = this.points()
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const raw = this.letterDate().trim() || new Date().toISOString().slice(0, 10);
    const d = new Date(raw + 'T00:00:00');
    const date = new Intl.DateTimeFormat(this.locale(), { dateStyle: 'long' }).format(
      Number.isNaN(d.getTime()) ? new Date() : d,
    );
    const lines: string[] = [];
    lines.push(this.fullName().trim() || '—');
    if (this.address().trim()) lines.push(this.address().trim());
    lines.push('');
    lines.push(date);
    lines.push('');
    lines.push(this.recipientRole().trim() || L('recipientRoleLabel'));
    if (this.recipientName().trim()) lines.push(this.recipientName().trim());
    if (this.organization().trim()) lines.push(this.organization().trim());
    lines.push('');
    lines.push(L('subjectPrefix') + ' ' + (this.subject().trim() || '—'));
    lines.push('');
    lines.push(L('salutation'));
    lines.push('');
    lines.push(L('intro_' + this.letterType()));
    lines.push('');
    for (const p of pts) {
      lines.push(p);
      lines.push('');
    }
    lines.push(L('closing_' + this.letterType()));
    lines.push('');
    lines.push(L('sincerely'));
    lines.push(this.fullName().trim() || '—');
    return lines.join('\n');
  });

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

  copy() {
    navigator.clipboard
      .writeText(this.letter())
      .then(() => {
        this.copied.set(true);
        if (this.copyTimer) clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => this.copied.set(false), 1500);
      })
      ;
  }

  download() {
    const blob = new Blob([this.letter()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'application-letter.txt';
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
