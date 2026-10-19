import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500&family=Poppins:wght@600;700&family=Roboto:wght@400;500&family=Merriweather:wght@700&family=Open+Sans:wght@400&family=Montserrat:wght@700&family=Lato:wght@400&family=Oswald:wght@600&family=Source+Sans+3:wght@400&family=DM+Serif+Display&family=DM+Sans:wght@400;500&family=Libre+Baskerville:wght@700&family=Karla:wght@400&family=Bebas+Neue&family=Nunito:wght@800&family=Nunito+Sans:wght@400&display=swap';

interface Pair {
  heading: string;
  body: string;
  headingStack: string;
  bodyStack: string;
  category: 'modern' | 'classic' | 'friendly' | 'bold' | 'editorial';
  fontsUrl: string;
}

const PAIRS: Pair[] = [
  { heading: 'Playfair Display', body: 'Inter', headingStack: "'Playfair Display', serif", bodyStack: "'Inter', sans-serif", category: 'editorial', fontsUrl: 'https://fonts.google.com/specimen/Playfair+Display' },
  { heading: 'Poppins', body: 'Roboto', headingStack: "'Poppins', sans-serif", bodyStack: "'Roboto', sans-serif", category: 'modern', fontsUrl: 'https://fonts.google.com/specimen/Poppins' },
  { heading: 'Merriweather', body: 'Open Sans', headingStack: "'Merriweather', serif", bodyStack: "'Open Sans', sans-serif", category: 'classic', fontsUrl: 'https://fonts.google.com/specimen/Merriweather' },
  { heading: 'Montserrat', body: 'Lato', headingStack: "'Montserrat', sans-serif", bodyStack: "'Lato', sans-serif", category: 'friendly', fontsUrl: 'https://fonts.google.com/specimen/Montserrat' },
  { heading: 'Oswald', body: 'Source Sans 3', headingStack: "'Oswald', sans-serif", bodyStack: "'Source Sans 3', sans-serif", category: 'bold', fontsUrl: 'https://fonts.google.com/specimen/Oswald' },
  { heading: 'DM Serif Display', body: 'DM Sans', headingStack: "'DM Serif Display', serif", bodyStack: "'DM Sans', sans-serif", category: 'modern', fontsUrl: 'https://fonts.google.com/specimen/DM+Serif+Display' },
  { heading: 'Libre Baskerville', body: 'Karla', headingStack: "'Libre Baskerville', serif", bodyStack: "'Karla', sans-serif", category: 'classic', fontsUrl: 'https://fonts.google.com/specimen/Libre+Baskerville' },
  { heading: 'Bebas Neue', body: 'Inter', headingStack: "'Bebas Neue', sans-serif", bodyStack: "'Inter', sans-serif", category: 'bold', fontsUrl: 'https://fonts.google.com/specimen/Bebas+Neue' },
  { heading: 'Nunito', body: 'Nunito Sans', headingStack: "'Nunito', sans-serif", bodyStack: "'Nunito Sans', sans-serif", category: 'friendly', fontsUrl: 'https://fonts.google.com/specimen/Nunito' },
];

@Component({
  selector: 'app-font-pair-finder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './font-pair-finder.component.html',
  styleUrl: './font-pair-finder.component.scss',
})
export class FontPairFinderComponent implements OnDestroy {
  readonly slug = 'font-pair-finder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['css-gradient-generator', 'color-contrast-checker', 'analogous-color-scheme', 'color-picker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly filter = signal<'all' | 'modern' | 'classic' | 'friendly' | 'bold' | 'editorial'>('all');
  readonly copied = signal('');

  private fontsLink: HTMLLinkElement | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    this.document.head.appendChild(link);
    this.fontsLink = link;
  }

  readonly pairs = computed(() =>
    this.filter() === 'all' ? PAIRS : PAIRS.filter((p) => p.category === this.filter())
  );

  cssSnippet(p: Pair): string {
    return `/* ${p.heading} + ${p.body} */\nh1, h2, h3 { font-family: ${p.headingStack}; }\nbody { font-family: ${p.bodyStack}; }`;
  }

  categoryLabel(cat: string): string {
    return this.t('labels.cat' + cat.charAt(0).toUpperCase() + cat.slice(1));
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

  setFilter(f: 'all' | 'modern' | 'classic' | 'friendly' | 'bold' | 'editorial') {
    this.filter.set(f);
  }

  copyText(text: string) {
    try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
    this.copied.set(text);
    window.setTimeout(() => { if (this.copied() === text) this.copied.set(''); }, 1500);
  }

  ngOnDestroy() {
    this.fontsLink?.remove();
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
