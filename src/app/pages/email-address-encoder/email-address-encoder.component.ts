import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-email-address-encoder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './email-address-encoder.component.html',
  styleUrl: './email-address-encoder.component.scss',
})
export class EmailAddressEncoderComponent implements OnDestroy {
  readonly slug = 'email-address-encoder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['html-entities-encoder-decoder', 'faq-schema-builder', 'hash-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly email = signal('hello@example.com');
  readonly copiedKey = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly valid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email().trim()));

  readonly decimal = computed(() => this.encode(this.email().trim(), (c) => `&#${c};`));
  readonly hex = computed(() => this.encode(this.email().trim(), (c) => `&#x${c.toString(16)};`));
  readonly percent = computed(() =>
    [...this.email().trim()].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  );
  readonly mailtoLink = computed(() => {
    const e = this.decimal();
    return `<a href="mailto:${e}">${e}</a>`;
  });
  readonly jsSnippet = computed(() => {
    const anchor = this.mailtoLink().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<script>\ndocument.write('${anchor}');\n</script>`;
  });

  readonly outputs = computed(() => [
    { key: 'decimal', label: this.t('labels.decimalLabel'), value: this.decimal() },
    { key: 'hex', label: this.t('labels.hexLabel'), value: this.hex() },
    { key: 'mailto', label: this.t('labels.mailtoLabel'), value: this.mailtoLink() },
    { key: 'js', label: this.t('labels.jsLabel'), value: this.jsSnippet() },
    { key: 'percent', label: this.t('labels.percentLabel'), value: this.percent() },
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

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
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

  setEmail(v: string) { this.email.set(v); }

  copyText(text: string, key: string) {
    const done = () => {
      this.copiedKey.set(key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(''), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private encode(email: string, fn: (code: number) => string): string {
    return [...email].map((ch) => fn(ch.charCodeAt(0))).join('');
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
