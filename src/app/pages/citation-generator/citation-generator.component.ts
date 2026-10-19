import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

type CiteStyle = 'apa' | 'mla' | 'chicago';
type SourceType = 'book' | 'journal' | 'website';

interface Author {
  last: string;
  first: string;
}

@Component({
  selector: 'app-citation-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './citation-generator.component.html',
  styleUrl: './citation-generator.component.scss',
})
export class CitationGeneratorComponent implements OnDestroy {
  readonly slug = 'citation-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['lorem-ipsum-generator', 'line-counter', 'serp-preview-tool'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly style = signal<CiteStyle>('apa');
  readonly sourceType = signal<SourceType>('book');
  readonly authors = signal('');
  readonly year = signal('');
  readonly title = signal('');
  readonly publisher = signal('');
  readonly journal = signal('');
  readonly volume = signal('');
  readonly issue = signal('');
  readonly pages = signal('');
  readonly url = signal('');
  readonly siteName = signal('');
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly output = computed(() => this.buildCitation());

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

  setStyle(s: CiteStyle) {
    this.style.set(s);
  }
  setSourceType(s: SourceType) {
    this.sourceType.set(s);
  }
  setAuthors(v: string) {
    this.authors.set(v);
  }
  setYear(v: string) {
    this.year.set(v);
  }
  setTitle(v: string) {
    this.title.set(v);
  }
  setPublisher(v: string) {
    this.publisher.set(v);
  }
  setJournal(v: string) {
    this.journal.set(v);
  }
  setVolume(v: string) {
    this.volume.set(v);
  }
  setIssue(v: string) {
    this.issue.set(v);
  }
  setPages(v: string) {
    this.pages.set(v);
  }
  setUrl(v: string) {
    this.url.set(v);
  }
  setSiteName(v: string) {
    this.siteName.set(v);
  }

  copy() {
    if (!this.output()) return;
    navigator.clipboard.writeText(this.output()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private parseAuthors(): Author[] {
    return this.authors()
      .split(';')
      .map((a) => a.trim())
      .filter((a) => a !== '')
      .map((a) => {
        const parts = a.split(',');
        const last = (parts[0] ?? '').trim();
        const first = parts.slice(1).join(',').trim();
        return { last, first };
      })
      .filter((a) => a.last !== '');
  }

  private initials(first: string): string {
    return first
      .split(/\s+/)
      .filter((w) => w !== '')
      .map((w) => w[0].toUpperCase() + '.')
      .join(' ');
  }

  private sentenceCase(title: string): string {
    const t = title.trim();
    if (t === '') return '';
    return t[0].toUpperCase() + t.slice(1).toLowerCase();
  }

  private authorString(style: CiteStyle): string {
    const list = this.parseAuthors();
    if (list.length === 0) return '';
    if (style === 'apa') {
      const parts = list.map((a) =>
        a.first ? `${a.last}, ${this.initials(a.first)}` : a.last
      );
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return `${parts[0]}, & ${parts[1]}`;
      return `${parts.slice(0, -1).join(', ')}, & ${parts[parts.length - 1]}`;
    }
    if (list.length > 3) return `${list[0].last}, ${list[0].first}, et al.`;
    const full = (a: Author) => (a.first ? `${a.last}, ${a.first}` : a.last);
    const flipped = (a: Author) => (a.first ? `${a.first} ${a.last}` : a.last);
    if (list.length === 1) return full(list[0]);
    if (list.length === 2) return `${full(list[0])}, and ${flipped(list[1])}`;
    return `${full(list[0])}, ${flipped(list[1])}, and ${flipped(list[2])}`;
  }

  private buildCitation(): string {
    const style = this.style();
    const type = this.sourceType();
    const authors = this.authorString(style);
    const year = this.year().trim();
    const titleRaw = this.title().trim();
    if (!authors && !titleRaw) return '';

    if (style === 'apa') {
      const title = this.sentenceCase(titleRaw);
      let cite = authors ? `${authors} ` : '';
      cite += year ? `(${year}). ` : '(n.d.). ';
      cite += title ? `${title}. ` : '';
      if (type === 'book') {
        const pub = this.publisher().trim();
        if (pub) cite += `${pub}.`;
      } else if (type === 'journal') {
        const j = this.journal().trim();
        const v = this.volume().trim();
        const i = this.issue().trim();
        const p = this.pages().trim();
        if (j) cite += `${j}`;
        if (v) cite += `, ${v}`;
        if (i) cite += `(${i})`;
        if (p) cite += `, ${p}`;
        if (j || v || p) cite += '.';
        const u = this.url().trim();
        if (u) cite += ` ${u}`;
      } else {
        const site = this.siteName().trim();
        const u = this.url().trim();
        if (site) cite += `${site}. `;
        if (u) cite += u;
      }
      return cite.trim();
    }

    const title = titleRaw;
    if (style === 'mla') {
      let cite = authors ? `${authors}. ` : '';
      cite += title ? `"${title}." ` : '';
      if (type === 'book') {
        const pub = this.publisher().trim();
        if (pub) cite += `${pub}, `;
        if (year) cite += `${year}.`;
      } else if (type === 'journal') {
        const j = this.journal().trim();
        const v = this.volume().trim();
        const i = this.issue().trim();
        if (j) cite += `${j}, `;
        if (v) cite += `vol. ${v}, `;
        if (i) cite += `no. ${i}, `;
        if (year) cite += `${year}, `;
        const p = this.pages().trim();
        if (p) cite += `pp. ${p}.`;
        const u = this.url().trim();
        if (u) cite += ` ${u}.`;
      } else {
        const site = this.siteName().trim();
        if (site) cite += `${site}, `;
        const u = this.url().trim();
        if (u) cite += `${u}.`;
      }
      return cite.trim();
    }

    let cite = authors ? `${authors}. ` : '';
    cite += year ? `${year}. ` : 'n.d. ';
    cite += title ? `"${title}." ` : '';
    if (type === 'book') {
      const pub = this.publisher().trim();
      if (pub) cite += `${pub}.`;
    } else if (type === 'journal') {
      const j = this.journal().trim();
      const v = this.volume().trim();
      const p = this.pages().trim();
      if (j) cite += `${j} `;
      if (v) cite += `${v} `;
      const i = this.issue().trim();
      if (i) cite += `(${i})`;
      if (p) cite += `: ${p}`;
      cite += '.';
      const u = this.url().trim();
      if (u) cite += ` ${u}.`;
    } else {
      const site = this.siteName().trim();
      if (site) cite += `${site}. `;
      const u = this.url().trim();
      if (u) cite += `${u}.`;
    }
    return cite.trim();
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
