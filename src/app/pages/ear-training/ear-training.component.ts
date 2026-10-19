import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface DrillItem {
  key: string;
  semis?: number;
  offsets?: number[];
}

const INTERVALS: DrillItem[] = [
  { key: 'm2', semis: 1 },
  { key: 'M2', semis: 2 },
  { key: 'm3', semis: 3 },
  { key: 'M3', semis: 4 },
  { key: 'P4', semis: 5 },
  { key: 'TT', semis: 6 },
  { key: 'P5', semis: 7 },
  { key: 'm6', semis: 8 },
  { key: 'M6', semis: 9 },
  { key: 'm7', semis: 10 },
  { key: 'M7', semis: 11 },
  { key: 'P8', semis: 12 },
];

const BASIC_INTERVALS = ['M2', 'M3', 'P4', 'P5', 'P8'];

const TRIADS: DrillItem[] = [
  { key: 'major', offsets: [0, 4, 7] },
  { key: 'minor', offsets: [0, 3, 7] },
  { key: 'dim', offsets: [0, 3, 6] },
  { key: 'aug', offsets: [0, 4, 8] },
];

@Component({
  selector: 'app-ear-training',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './ear-training.component.html',
  styleUrl: './ear-training.component.scss',
})
export class EarTrainingComponent implements OnDestroy {
  readonly slug = 'ear-training';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['piano-note-checker', 'instrument-tuner', 'tone-generator', 'scale-trainer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly drill = signal<'intervals' | 'triads'>('intervals');
  readonly level = signal<'basic' | 'full'>('basic');
  readonly harmonic = signal(false);
  readonly answered = signal(false);
  readonly picked = signal<number>(-1);
  readonly correct = signal(0);
  readonly total = signal(0);
  readonly streak = signal(0);

  private current: { base: number; answerIdx: number; pool: DrillItem[] } | null = null;
  private audioCtx: AudioContext | null = null;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly pool = computed(() => {
    if (this.drill() === 'triads') return TRIADS;
    return this.level() === 'basic' ? INTERVALS.filter((i) => BASIC_INTERVALS.includes(i.key)) : INTERVALS;
  });

  readonly accuracy = computed(() => {
    const t = this.total();
    return t === 0 ? 0 : Math.round((this.correct() / t) * 100);
  });

  readonly optionLabel = (key: string): string => {
    const group = this.drill() === 'triads' ? 'triads' : 'intervals';
    return this.t(`labels.${group}.${key}`);
  };

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

  setDrill(d: 'intervals' | 'triads'): void {
    this.drill.set(d);
    this.resetRound();
  }

  setLevel(l: 'basic' | 'full'): void {
    this.level.set(l);
    this.resetRound();
  }

  setHarmonic(v: boolean): void {
    this.harmonic.set(v);
  }

  resetRound(): void {
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    this.current = null;
    this.answered.set(false);
    this.picked.set(-1);
  }

  newRound(): void {
    this.resetRound();
    const pool = this.pool();
    const answerIdx = Math.floor(Math.random() * pool.length);
    const base = 60 + Math.floor(Math.random() * 12);
    this.current = { base, answerIdx, pool };
    this.playCurrent();
  }

  replay(): void {
    this.playCurrent();
  }

  answer(i: number): void {
    if (!this.current || this.answered()) return;
    this.answered.set(true);
    this.picked.set(i);
    this.total.set(this.total() + 1);
    if (i === this.current.answerIdx) {
      this.correct.set(this.correct() + 1);
      this.streak.set(this.streak() + 1);
    } else {
      this.streak.set(0);
    }
    this.nextTimer = setTimeout(() => this.newRound(), 1600);
  }

  isAnswer(i: number): boolean {
    return this.answered() && this.current !== null && i === this.current.answerIdx;
  }

  isWrongPick(i: number): boolean {
    return this.answered() && i === this.picked() && !this.isAnswer(i);
  }

  private playCurrent(): void {
    const c = this.current;
    if (!c) return;
    const item = c.pool[c.answerIdx];
    if (item.semis !== undefined) {
      this.playInterval(c.base, item.semis, this.harmonic());
    } else if (item.offsets) {
      this.playChord(c.base, item.offsets);
    }
  }

  private tone(midi: number, start: number, dur: number, peak = 0.3): void {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private playInterval(base: number, semis: number, harmonic: boolean): void {
    const t0 = this.ensureCtx().currentTime + 0.05;
    if (harmonic) {
      this.tone(base, t0, 1.2);
      this.tone(base + semis, t0, 1.2);
    } else {
      this.tone(base, t0, 0.55);
      this.tone(base + semis, t0 + 0.6, 0.8);
    }
  }

  private playChord(base: number, offsets: number[]): void {
    const t0 = this.ensureCtx().currentTime + 0.05;
    for (const o of offsets) this.tone(base + o, t0, 1.4, 0.2);
  }

  ngOnDestroy(): void {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.audioCtx?.close();
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private ensureCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
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
