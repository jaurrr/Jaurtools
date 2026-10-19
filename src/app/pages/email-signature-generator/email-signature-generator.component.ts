import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-email-signature-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './email-signature-generator.component.html',
  styleUrl: './email-signature-generator.component.scss',
})
export class EmailSignatureGeneratorComponent implements OnDestroy {
  readonly slug = 'email-signature-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['meta-tags-generator', 'robots-txt-generator', 'biodata-maker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly name = signal('Jauhar Ayyub');
  readonly jobTitle = signal('Frontend Developer');
  readonly company = signal('Digital Transformation Factory');
  readonly phone = signal('+91 98765 43210');
  readonly email = signal('jauhar@example.com');
  readonly website = signal('https://example.com');
  readonly accentColor = signal('#4f46e5');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  readonly html = computed(() => {
    const e = (v: string) => this.esc(v.trim());
    const accent = this.accentColor();
    const line1 = [e(this.jobTitle()), e(this.company())].filter(Boolean).join(' &middot; ');
    const contact: string[] = [];
    if (this.phone().trim()) contact.push(`<a href="tel:${e(this.phone().replace(/\s+/g, ''))}" style="color: #0f172a; text-decoration: none;">${e(this.phone())}</a>`);
    if (this.email().trim()) contact.push(`<a href="mailto:${e(this.email())}" style="color: #0f172a; text-decoration: none;">${e(this.email())}</a>`);
    if (this.website().trim()) contact.push(`<a href="${e(this.website())}" style="color: ${accent}; text-decoration: none;">${e(this.website().replace(/^https?:\/\//, ''))}</a>`);
    return (
      `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #0f172a;">` +
      `<tr><td style="padding-bottom: 6px; border-bottom: 2px solid ${accent};">` +
      `<strong style="font-size: 17px; color: ${accent};">${e(this.name()) || 'Your Name'}</strong>` +
      (line1 ? `<br><span style="color: #475569;">${line1}</span>` : '') +
      `</td></tr>` +
      (contact.length > 0 ? `<tr><td style="padding-top: 6px;">${contact.join(' &nbsp;|&nbsp; ')}</td></tr>` : '') +
      `</table>`
    );
  });

  readonly hasContent = computed(() => this.name().trim().length > 0);

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

  async copyHtml(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.html()).catch(() => undefined);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  downloadHtml(): void {
    const blob = new Blob([this.html()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'email-signature.html';
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
