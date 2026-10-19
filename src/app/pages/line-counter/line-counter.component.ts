import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

@Component({
  selector: 'app-line-counter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './line-counter.component.html',
  styleUrl: './line-counter.component.scss',
})
export class LineCounterComponent implements OnDestroy {
  readonly slug = 'line-counter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['case-converter', 'whitespace-remover', 'find-and-replace'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private segmenter: Intl.Segmenter | null | undefined;
  readonly dragOver = signal(false);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly lines = computed(() => (this.text() === '' ? 0 : this.text().split('\n').length));

  readonly nonEmptyLines = computed(() =>
    this.text().split('\n').filter((l) => l.trim() !== '').length
  );

  readonly paragraphs = computed(() =>
    this.text().split(/\n{2,}|\r{2,}/).filter((p) => p.trim() !== '').length
  );

  readonly words = computed(() => this.countWords(this.text()));

  readonly chars = computed(() => this.text().length);

  readonly charsNoSpaces = computed(() => this.text().replace(/\s/g, '').length);

  readonly sentences = computed(
    () => this.text().split(/[.!?…]+/).filter((s) => s.trim() !== '').length
  );

  readonly avgWordsPerLine = computed(() => {
    const l = this.lines();
    if (l === 0) return 0;
    return Math.round((this.words() / l) * 100) / 100;
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

  setText(v: string) {
    const val = (v);
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  copyStats() {
    const lines = [
      `${this.t('labels.linesLabel')}: ${this.lines()}`,
      `${this.t('labels.nonEmptyLabel')}: ${this.nonEmptyLines()}`,
      `${this.t('labels.paragraphsLabel')}: ${this.paragraphs()}`,
      `${this.t('labels.wordsLabel')}: ${this.words()}`,
      `${this.t('labels.sentencesLabel')}: ${this.sentences()}`,
      `${this.t('labels.charsLabel')}: ${this.chars()}`,
      `${this.t('labels.charsNoSpacesLabel')}: ${this.charsNoSpaces()}`,
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }


  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !/\.txt$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      this.setText(content.slice(0, 500000));
    };
    reader.readAsText(file);
  }

  private countWords(value: string): number {
    const seg = this.getSegmenter();
    if (!seg) {
      const t = value.trim();
      return t === '' ? 0 : t.split(/\s+/).length;
    }
    let n = 0;
    for (const part of seg.segment(value)) {
      if (part.isWordLike) n++;
    }
    return n;
  }

  private getSegmenter(): Intl.Segmenter | null {
    if (this.segmenter === undefined) {
      try {
        const lang = this.translate.lang();
        const tag = lang === 'hi' ? 'hi' : lang === 'ar' ? 'ar' : 'en';
        this.segmenter = new Intl.Segmenter(tag, { granularity: 'word' });
      } catch {
        this.segmenter = null;
      }
    }
    return this.segmenter;
  }

  ngOnDestroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
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
