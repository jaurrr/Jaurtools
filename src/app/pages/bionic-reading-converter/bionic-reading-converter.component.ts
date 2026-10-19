import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type Strength = 'light' | 'medium' | 'strong';

@Component({
  selector: 'app-bionic-reading-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './bionic-reading-converter.component.html',
  styleUrl: './bionic-reading-converter.component.scss',
})
export class BionicReadingConverterComponent implements OnDestroy {
  readonly slug = 'bionic-reading-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['lorem-ipsum-generator', 'case-converter', 'line-counter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly strength = signal<Strength>('medium');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly html = computed((): SafeHtml => this.sanitizer.bypassSecurityTrustHtml(this.renderBionic()));

  readonly rawHtml = computed(() => this.renderBionic());

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

  setText(v: string) {
    const val = (v);
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  setStrength(s: Strength) {
    this.strength.set(s);
  }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  copyHtml() {
    const h = this.rawHtml();
    if (!h) return;
    navigator.clipboard.writeText(h).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  download() {
    const h = this.rawHtml();
    if (!h) return;
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bionic Reading</title></head><body><div style="font-size:1.25rem;line-height:1.8;max-width:40rem;margin:2rem auto;">${h}</div></body></html>`;
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'bionic-reading.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private renderBionic(): string {
    const ratio = this.strength() === 'light' ? 0.3 : this.strength() === 'medium' ? 0.4 : 0.5;
    return this.escapeHtml(this.text())
      .split(/(\s+)/)
      .map((tok) => {
        if (tok === '' || /^\s+$/.test(tok)) return tok;
        const k = Math.max(1, Math.round(tok.length * ratio));
        return `<strong>${tok.slice(0, k)}</strong>${tok.slice(k)}`;
      })
      .join('');
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
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
