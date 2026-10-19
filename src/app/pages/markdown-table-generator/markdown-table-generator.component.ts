import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'app-markdown-table-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './markdown-table-generator.component.html',
  styleUrl: './markdown-table-generator.component.scss',
})
export class MarkdownTableGeneratorComponent implements OnDestroy {
  readonly slug = 'markdown-table-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['markdown-html', 'xml-formatter', 'yaml-formatter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly rows = signal(3);
  readonly cols = signal(3);
  readonly withHeader = signal(true);
  readonly align = signal<'left' | 'center' | 'right'>('left');
  readonly cells = signal<string[][]>([
    ['Name', 'Role', 'City'],
    ['Aarav', 'Developer', 'Mumbai'],
    ['Sana', 'Designer', 'Delhi'],
  ]);
  readonly copied = signal(false);

  setRows(v: number): void {
    const n = this.clampNum(v, 1, 10);
    this.rows.set(n);
    this.resize(n, this.cols());
  }

  setCols(v: number): void {
    const n = this.clampNum(v, 1, 8);
    this.cols.set(n);
    this.resize(this.rows(), n);
  }

  private resize(r: number, c: number): void {
    const old = this.cells();
    const next: string[][] = [];
    for (let ri = 0; ri < r; ri++) {
      const row: string[] = [];
      for (let ci = 0; ci < c; ci++) {
        row.push(old[ri]?.[ci] ?? `R${ri + 1}C${ci + 1}`);
      }
      next.push(row);
    }
    this.cells.set(next);
  }

  setCell(ri: number, ci: number, v: string): void {
    const next = this.cells().map((row) => row.slice());
    if (next[ri]) next[ri][ci] = v.slice(0, 200);
    this.cells.set(next);
  }

  toggleHeader(): void {
    this.withHeader.update((v) => !v);
  }

  setAlign(a: 'left' | 'center' | 'right'): void {
    this.align.set(a);
  }

  fillSample(): void {
    this.rows.set(4);
    this.cols.set(3);
    this.withHeader.set(true);
    this.align.set('left');
    this.cells.set([
      ['Name', 'Role', 'City'],
      ['Aarav', 'Developer', 'Mumbai'],
      ['Sana', 'Designer', 'Delhi'],
      ['Kabir', 'Tester', 'Jaipur'],
    ]);
  }

  readonly markdown = computed(() => {
    const data = this.cells();
    if (!data.length) return '';
    const sep = this.align() === 'center' ? ':---:' : this.align() === 'right' ? '---:' : ':---';
    const clean = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const row = (r: string[]) => '| ' + r.map(clean).join(' | ') + ' |';
    const lines: string[] = [];
    if (this.withHeader()) {
      lines.push(row(data[0]));
      lines.push('| ' + data[0].map(() => sep).join(' | ') + ' |');
      for (const r of data.slice(1)) lines.push(row(r));
    } else {
      for (const r of data) lines.push(row(r));
    }
    return lines.join('\n');
  });

  copyOutput(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(this.markdown())
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1600);
      })
      ;
  }

  downloadMd(): void {
    const blob = new Blob([this.markdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'table.md';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private clampNum(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
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
