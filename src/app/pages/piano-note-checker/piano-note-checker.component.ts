import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_IDX = [1, 3, 6, 8, 10];
const WHITE_COUNT = 14;

interface PianoKey {
  midi: number;
  name: string;
  black: boolean;
  whiteIndex: number;
}

@Component({
  selector: 'app-piano-note-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './piano-note-checker.component.html',
  styleUrl: './piano-note-checker.component.scss',
})
export class PianoNoteCheckerComponent implements OnDestroy {
  readonly slug = 'piano-note-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ear-training', 'note-frequency-calculator', 'instrument-tuner', 'scale-trainer'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<'explore' | 'quiz'>('explore');
  readonly showNames = signal(true);
  readonly lastMidi = signal(60);
  readonly quizTarget = signal<number | null>(null);
  readonly feedback = signal<'idle' | 'correct' | 'wrong'>('idle');
  readonly correct = signal(0);
  readonly total = signal(0);
  readonly streak = signal(0);

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

  private keyName(midi: number): string {
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  private keyFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  readonly layout = computed(() => {
    const keys: PianoKey[] = [];
    let w = 0;
    for (let midi = 60; midi <= 83; midi++) {
      const black = BLACK_IDX.includes(midi % 12);
      keys.push({ midi, name: this.keyName(midi), black, whiteIndex: black ? w - 1 : w });
      if (!black) w++;
    }
    return keys;
  });

  readonly whiteKeys = computed(() => this.layout().filter((k) => !k.black));
  readonly blackKeys = computed(() => this.layout().filter((k) => k.black));

  readonly lastName = computed(() => this.keyName(this.lastMidi()));
  readonly lastFreq = computed(() => this.keyFreq(this.lastMidi()));
  readonly quizTargetName = computed(() => {
    const target = this.quizTarget();
    return target === null ? '' : this.keyName(target);
  });

  readonly accuracy = computed(() => {
    const t = this.total();
    return t === 0 ? 0 : Math.round((this.correct() / t) * 100);
  });

  readonly twoDec = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );

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

  setMode(m: 'explore' | 'quiz'): void {
    this.mode.set(m);
    this.feedback.set('idle');
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    if (m === 'quiz') this.startQuiz();
    else this.quizTarget.set(null);
  }

  setShowNames(v: boolean): void {
    this.showNames.set(v);
  }

  blackLeft(whiteIndex: number): string {
    return `${((whiteIndex + 1) / WHITE_COUNT) * 100}%`;
  }

  pressKey(midi: number): void {
    this.lastMidi.set(midi);
    this.playTone(midi, 0.8);
    if (this.mode() === 'quiz' && this.quizTarget() !== null && this.feedback() === 'idle') {
      this.total.set(this.total() + 1);
      if (midi === this.quizTarget()) {
        this.correct.set(this.correct() + 1);
        this.streak.set(this.streak() + 1);
        this.feedback.set('correct');
      } else {
        this.streak.set(0);
        this.feedback.set('wrong');
      }
      this.nextTimer = setTimeout(() => this.newQuestion(), 1400);
    }
  }

  startQuiz(): void {
    this.correct.set(0);
    this.total.set(0);
    this.streak.set(0);
    this.newQuestion();
  }

  newQuestion(): void {
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    const midi = 60 + Math.floor(Math.random() * 24);
    this.quizTarget.set(midi);
    this.feedback.set('idle');
    this.playTone(midi, 1);
  }

  replayTarget(): void {
    const target = this.quizTarget();
    if (target !== null) this.playTone(target, 1);
  }

  private playTone(midi: number, dur: number): void {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = this.keyFreq(midi);
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
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
