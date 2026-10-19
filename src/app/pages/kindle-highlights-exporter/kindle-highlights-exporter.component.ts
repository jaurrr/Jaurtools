import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type ClipType = 'highlight' | 'note' | 'bookmark';

interface Clip {
  title: string;
  author: string;
  type: ClipType;
  page: string;
  location: string;
  added: string;
  content: string;
}

const SAMPLE = [
  'Atomic Habits (James Clear)',
  '- Your Highlight on page 45 | Location 812-813 | Added on Monday, 6 October 2025 08:12:33',
  '',
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  '==========',
  'Atomic Habits (James Clear)',
  '- Your Note on page 45 | Location 814 | Added on Monday, 6 October 2025 08:14:02',
  '',
  'Apply this to the morning routine project.',
  '==========',
  'The Alchemist (Paulo Coelho)',
  '- Your Highlight on Location 2041-2042 | Added on Sunday, 12 October 2025 21:03:11',
  '',
  'And, when you want something, all the universe conspires in helping you to achieve it.',
  '==========',
  'The Alchemist (Paulo Coelho)',
  '- Your Bookmark on page 112 | Location 2100 | Added on Sunday, 12 October 2025 21:05:44',
  '',
  '==========',
].join('\n');

@Component({
  selector: 'app-kindle-highlights-exporter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './kindle-highlights-exporter.component.html',
  styleUrl: './kindle-highlights-exporter.component.scss',
})
export class KindleHighlightsExporterComponent implements OnDestroy {
  readonly copied = signal(false);
  readonly copyText = computed(() => this.entries().length);
  copyMain(): void {
    const text = String(this.copyText());
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
  }

  readonly slug = 'kindle-highlights-exporter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-notepad', 'speed-reader', 'keyword-density-checker'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly rawText = signal('');
  readonly fileError = signal('');

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly entries = computed<Clip[]>(() => {
    const raw = this.rawText();
    if (!raw.trim()) return [];
    const lines = raw.split(/\r?\n/);
    const blocks: string[][] = [];
    let current: string[] = [];
    for (const line of lines) {
      if (/^={5,}\s*$/.test(line.trim())) {
        if (current.some((l) => l.trim().length > 0)) blocks.push(current);
        current = [];
      } else {
        current.push(line);
      }
    }
    if (current.some((l) => l.trim().length > 0)) blocks.push(current);
    const out: Clip[] = [];
    for (const b of blocks) {
      const clip = this.parseBlock(b);
      if (clip) out.push(clip);
    }
    return out;
  });

  readonly highlightCount = computed(() => this.entries().filter((e) => e.type === 'highlight').length);
  readonly noteCount = computed(() => this.entries().filter((e) => e.type === 'note').length);
  readonly bookmarkCount = computed(() => this.entries().filter((e) => e.type === 'bookmark').length);
  readonly bookCount = computed(() => new Set(this.entries().map((e) => e.title)).size);

  setRawText(v: string): void {
    this.rawText.set(v.slice(0, 2000000));
    if (v.trim()) this.fileError.set('');
  }

  loadSample(): void {
    this.rawText.set(SAMPLE);
    this.fileError.set('');
  }

  clearAll(): void {
    this.rawText.set('');
    this.fileError.set('');
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const isTxt = /\.txt$/i.test(file.name) || file.type === 'text/plain';
    if (!isTxt) {
      this.fileError.set(this.t('labels.errorFileType'));
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.fileError.set(this.t('labels.errorFileSize'));
      input.value = '';
      return;
    }
    this.fileError.set('');
    const reader = new FileReader();
    reader.onload = () => this.rawText.set(String(reader.result || ''));
    reader.onerror = () => this.fileError.set(this.t('labels.errorFileRead'));
    reader.readAsText(file);
    input.value = '';
  }

  exportMarkdown(): void {
    const lines: string[] = ['# ' + this.t('labels.exportTitle'), ''];
    const byBook = this.groupByBook();
    for (const [book, clips] of byBook) {
      lines.push('## ' + book, '');
      for (const c of clips) {
        const meta = [c.page ? 'p. ' + c.page : '', c.location ? 'loc. ' + c.location : '', c.added]
          .filter(Boolean)
          .join(' | ');
        lines.push('- **' + this.typeName(c.type) + '** (' + meta + ')');
        if (c.content) lines.push('  > ' + c.content.replace(/\n/g, ' '));
        lines.push('');
      }
    }
    this.download('kindle-highlights.md', lines.join('\n'), 'text/markdown');
  }

  exportCsv(): void {
    const rows: string[] = ['title,author,type,page,location,added,content'];
    for (const c of this.entries()) {
      rows.push(
        [c.title, c.author, c.type, c.page, c.location, c.added, c.content.replace(/\n/g, ' ')]
          .map((v) => '"' + v.replace(/"/g, '""') + '"')
          .join(',')
      );
    }
    this.download('kindle-highlights.csv', '\uFEFF' + rows.join('\n'), 'text/csv');
  }

  exportJson(): void {
    this.download('kindle-highlights.json', JSON.stringify(this.entries(), null, 2), 'application/json');
  }

  typeName(t: ClipType): string {
    return this.t('typeNames.' + t);
  }

  private groupByBook(): [string, Clip[]][] {
    const map = new Map<string, Clip[]>();
    for (const c of this.entries()) {
      const key = c.author ? c.title + ' — ' + c.author : c.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(c);
    }
    return [...map.entries()];
  }

  private parseBlock(lines: string[]): Clip | null {
    const titleLine = (lines[0] || '').trim();
    const metaLine = (lines[1] || '').trim();
    if (!titleLine || !metaLine.startsWith('- Your ')) return null;
    const tm = titleLine.match(/^(.*)\s+\(([^()]*)\)\s*$/);
    const title = tm ? tm[1].trim() : titleLine;
    const author = tm ? tm[2].trim() : '';
    const mm = metaLine.match(/^- Your (Highlight|Note|Bookmark) on (.+)$/i);
    if (!mm) return null;
    const kind = mm[1].toLowerCase() as ClipType;
    const rest = mm[2];
    const page = rest.match(/page\s+(\d+)/i)?.[1] || '';
    const location = rest.match(/location\s+([\d\-–]+)/i)?.[1] || '';
    const added = rest.match(/added on\s+(.+)$/i)?.[1]?.trim() || '';
    const content = lines.slice(3).join('\n').trim();
    return { title, author, type: kind, page, location, added, content };
  }

  private download(name: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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

  ngOnDestroy(): void {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }


  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
