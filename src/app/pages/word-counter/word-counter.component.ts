import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

interface WordStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  minutes: number;
}

interface DensityRow {
  word: string;
  count: number;
  density: number;
}

interface Goal {
  id: string;
  target: number;
  unit: 'chars' | 'words';
}

const GOALS: Goal[] = [
  { id: 'xpost', target: 280, unit: 'chars' },
  { id: 'meta', target: 160, unit: 'chars' },
  { id: 'essay', target: 650, unit: 'words' },
];

@Component({
  selector: 'app-word-counter',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './word-counter.component.html',
  styleUrl: './word-counter.component.scss',
})
export class WordCounterComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private title = inject(Title);
  private meta = inject(Meta);

  readonly slug = 'word-counter';
  readonly related = ['unit-converter', 'percentage-calculator'];
  readonly lang = this.translate.lang;

  /** Raw keystrokes (drives the textarea); `text` is the 250ms-debounced value stats read. */
  rawText = signal('');
  text = signal('');
  copied = signal(false);
  activeGoal = signal<string | null>(null);
  dragOver = signal(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private segmenter: Intl.Segmenter | null | undefined;

  readonly goals = GOALS;

  stats = computed((): WordStats => {
    const value = this.text();
    const trimmed = value.trim();
    const words = this.countWords(value);
    const characters = value.length;
    const charactersNoSpaces = value.replace(/\s/g, '').length;
    const sentences = trimmed ? value.split(/[.!?।؟]+/).filter((s) => s.trim().length > 0).length : 0;
    const paragraphs = trimmed ? value.split(/\n+/).filter((p) => p.trim().length > 0).length : 0;
    return { words, characters, charactersNoSpaces, sentences, paragraphs, minutes: words / 200 };
  });

  readingTime = computed((): string => {
    const { words, minutes } = this.stats();
    if (words === 0) return this.t(`${this.slug}.ui.empty`);
    if (minutes < 1) return this.t(`${this.slug}.ui.lessThanMinute`);
    return `${Math.ceil(minutes)} ${this.t(`${this.slug}.ui.minuteShort`)}`;
  });

  /** Live keyword-density strip: top 10 word-like tokens by frequency. */
  density = computed((): DensityRow[] => {
    const value = this.text();
    const total = this.stats().words;
    if (total === 0) return [];
    const counts = new Map<string, number>();
    for (const token of this.wordTokens(value)) {
      const key = token.toLocaleLowerCase();
      if (key.length === 0) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count, density: (count / total) * 100 }));
  });

  goalProgress = computed(() => {
    const id = this.activeGoal();
    if (!id) return null;
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) return null;
    const done = goal.unit === 'chars' ? this.stats().characters : this.stats().words;
    return { goal, done, pct: Math.min(100, (done / goal.target) * 100) };
  });

  keyFacts = computed(() => this.tx<string[]>(`${this.slug}.keyFacts`));
  howTo = computed(() => this.tx<string[]>(`${this.slug}.howTo`));
  benefits = computed(() => this.tx<string[]>(`${this.slug}.benefits`));
  limitations = computed(() => this.tx<string[]>(`${this.slug}.limitations`));
  mistakes = computed(() => this.tx<string[]>(`${this.slug}.ui.mistakes`));
  countRules = computed(() => this.tx<string[]>(`${this.slug}.ui.rules`));
  faqs = computed(() => this.tx<{ q: string; a: string }[]>(`${this.slug}.faqs`));

  constructor() {
    effect(() => {
      this.translate.lang();
      this.applySeo();
    });
  }

  ngOnInit(): void {
    this.applySeo();
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    document.querySelectorAll('[data-seo-page]').forEach((el) => el.remove());
    document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  t(key: string): string {
    return String(this.translate.t(key));
  }

  setText(v: string): void {
    this.rawText.set(v);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(v), 250);
  }

  clearText(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  toggleGoal(id: string): void {
    this.activeGoal.update((cur) => (cur === id ? null : id));
  }

  goalName(id: string): string {
    return this.t(`${this.slug}.ui.goal${id[0].toUpperCase()}${id.slice(1)}`);
  }

  goalUnitLabel(unit: 'chars' | 'words'): string {
    return unit === 'chars' ? this.t(`${this.slug}.ui.charsUnit`) : this.t(`${this.slug}.ui.words`);
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

  densityLabel(row: DensityRow): string {
    return `${row.count} ${this.t(`${this.slug}.ui.timesLabel`)} · ${row.density.toFixed(1)}%`;
  }

  copyStats(): void {
    this.copyText(this.statsText());
  }

  downloadTxt(): void {
    const blob = new Blob([this.statsText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'word-count.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private statsText(): string {
    const s = this.stats();
    return [
      `${this.t(`${this.slug}.ui.words`)}: ${s.words}`,
      `${this.t(`${this.slug}.ui.characters`)}: ${s.characters}`,
      `${this.t(`${this.slug}.ui.noSpaces`)}: ${s.charactersNoSpaces}`,
      `${this.t(`${this.slug}.ui.sentences`)}: ${s.sentences}`,
      `${this.t(`${this.slug}.ui.paragraphs`)}: ${s.paragraphs}`,
      `${this.t(`${this.slug}.ui.readingTime`)}: ${this.readingTime()}`,
    ].join('\n');
  }

  private copyText(text: string): void {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  private legacyCopy(text: string, done: () => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch {
      // clipboard unavailable in this browser
    }
  }

  /** Word-like tokens via Intl.Segmenter (CJK/Arabic aware), with a space-split fallback. */
  private wordTokens(value: string): string[] {
    const seg = this.getSegmenter();
    if (seg) {
      const out: string[] = [];
      for (const part of seg.segment(value)) {
        if (part.isWordLike) out.push(part.segment);
      }
      return out;
    }
    return value.trim() ? value.trim().split(/\s+/) : [];
  }

  private countWords(value: string): number {
    return this.wordTokens(value).length;
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

  private tx<T>(key: string): T {
    return this.translate.t(key) as T;
  }

  private applySeo(): void {
    const lang = this.translate.lang();
    const base = 'https://jaurtools.com';
    this.title.setTitle(this.t(`${this.slug}.metaTitle`));
    this.meta.updateTag({ name: 'description', content: this.t(`${this.slug}.metaDescription`) });
    this.setLink('canonical', `${base}/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink(`hreflang-${l}`, `${base}/${l}/${this.slug}`, l);
    }
    this.setLink('hreflang-default', `${base}/en/${this.slug}`, 'x-default');

    document.getElementById('faq-jsonld')?.remove();
    const faqs = this.faqs();
    if (Array.isArray(faqs) && faqs.length > 0) {
      const data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      };
      const script = document.createElement('script');
      script.id = 'faq-jsonld';
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-page', '');
      script.text = JSON.stringify(data).replace(/</g, '\\u003c');
      document.head.appendChild(script);
    }
  }

  private setLink(id: string, href: string, hreflang?: string): void {
    document.querySelector(`link[data-seo-page="seo-${id}"]`)?.remove();
    const link = document.createElement('link');
    link.setAttribute('data-seo-page', `seo-${id}`);
    link.rel = id === 'canonical' ? 'canonical' : 'alternate';
    if (hreflang) link.hreflang = hreflang;
    link.href = href;
    document.head.appendChild(link);
  }
}
