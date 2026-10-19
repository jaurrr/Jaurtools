import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-award-certificate-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './award-certificate-generator.component.html',
  styleUrl: './award-certificate-generator.component.scss',
})
export class AwardCertificateGeneratorComponent implements OnDestroy {
  readonly slug = 'award-certificate-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['application-letter-writer', 'xml-sitemap-generator', 'wifi-qr-code-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly recipient = signal('');
  readonly awardTitle = signal('');
  readonly organization = signal('');
  readonly presenter = signal('');
  readonly reason = signal('');
  readonly certDate = signal(new Date().toISOString().slice(0, 10));
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang(); // re-run on language change
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly formattedDate = computed(() => {
    const raw = this.certDate().trim() || new Date().toISOString().slice(0, 10);
    const d = new Date(raw + 'T00:00:00');
    const ok = !Number.isNaN(d.getTime());
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'long' }).format(ok ? d : new Date());
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

  print() {
    this.document.defaultView?.print();
  }

  download() {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html>
<html lang="${this.translate.lang()}">
<head><meta charset="utf-8"><title>${esc(this.t('name'))}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;display:flex;justify-content:center;padding:2rem;background:#f8fafc;color:#0f172a}
.cert{border:6px double #4f46e5;padding:3rem 4rem;text-align:center;max-width:700px;background:#fff}
.cert h1{color:#4f46e5;letter-spacing:.2em;text-transform:uppercase;font-size:1.5rem}
.cert .name{font-size:2.25rem;margin:1rem 0}
.cert .title{font-size:1.25rem;font-style:italic}
.cert .meta{display:flex;justify-content:space-between;margin-top:3rem;font-size:.9rem}
</style></head>
<body><div class="cert">
<h1>${esc(this.t('labels.certHeading'))}</h1>
<p>${esc(this.t('labels.certKicker'))}</p>
<p class="name">${esc(this.recipient() || '—')}</p>
<p>${esc(this.t('labels.certFor'))}</p>
<p class="title">${esc(this.awardTitle() || '—')}</p>
${this.reason().trim() ? `<p>${esc(this.reason().trim())}</p>` : ''}
<div class="meta"><div>${esc(this.t('labels.certDate'))}: ${esc(this.formattedDate())}</div><div>${esc(this.t('labels.certSignedBy'))}: ${esc(this.presenter() || this.organization() || '—')}</div></div>
<p>${esc(this.organization())}</p>
</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'award-certificate.html';
    a.click();
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
