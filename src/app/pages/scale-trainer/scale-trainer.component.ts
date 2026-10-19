import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ScaleDef {
  key: string;
  intervals: number[];
}

const SCALES: ScaleDef[] = [
  { key: 'major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { key: 'natMinor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { key: 'harMinor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { key: 'melMinor', intervals: [0, 2, 3, 5, 7, 9, 11] },
  { key: 'majPent', intervals: [0, 2, 4, 7, 9] },
  { key: 'minPent', intervals: [0, 3, 5, 7, 10] },
  { key: 'blues', intervals: [0, 3, 5, 6, 7, 10] },
  { key: 'dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { key: 'mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { key: 'phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
];

const PATTERN_ORDER = ['straight', 'thirds', 'fours'];

@Component({
  selector: 'app-scale-trainer',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './scale-trainer.component.html',
  styleUrl: './scale-trainer.component.scss',
})
export class ScaleTrainerComponent implements OnDestroy {
  readonly slug = 'scale-trainer';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['ear-training', 'piano-note-checker', 'chord-progression-generator', 'note-frequency-calculator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly root = signal(0);
  readonly scaleKey = signal('major');
  readonly pattern = signal('straight');
  readonly bpm = signal(90);
  readonly playing = signal(false);

  readonly noteNames = NOTE_NAMES;
  readonly scaleDefs = SCALES;
  readonly patternOrder = PATTERN_ORDER;

  private audioCtx: AudioContext | null = null;
  private activeOscs: OscillatorNode[] = [];
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly scaleDef = computed(() => SCALES.find((s) => s.key === this.scaleKey()) ?? SCALES[0]);

  readonly notes = computed(() => {
    const base = 60 + this.root();
    return this.scaleDef().intervals.map((iv, i) => {
      const midi = base + iv;
      return {
        degree: i + 1,
        name: NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1),
        midi,
        semis: iv,
      };
    });
  });

  readonly steps = computed(() => {
    const ivs = this.scaleDef().intervals;
    const diffs: number[] = [];
    for (let i = 1; i < ivs.length; i++) diffs.push(ivs[i] - ivs[i - 1]);
    diffs.push(12 - ivs[ivs.length - 1]);
    return diffs.join('-');
  });

  readonly noteList = computed(() => this.notes().map((n) => n.name).join(' - '));

  readonly sequence = computed(() => {
    const midis = this.notes().map((n) => n.midi);
    const n = midis.length;
    const p = this.pattern();
    if (p === 'thirds') {
      const seq: number[] = [];
      for (let i = 0; i <= n - 3; i++) seq.push(midis[i], midis[i + 2]);
      return seq;
    }
    if (p === 'fours') {
      const seq: number[] = [];
      for (let i = 0; i <= n - 4; i++) seq.push(midis[i], midis[i + 1], midis[i + 2], midis[i + 3]);
      return seq;
    }
    return [...midis, ...midis.slice(0, n - 1).reverse()];
  });

  readonly scaleName = computed(
    () => `${NOTE_NAMES[this.root()]} ${this.t('labels.scales.' + this.scaleKey())}`,
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

  setRoot(i: number): void {
    this.root.set(i);
  }

  setScale(k: string): void {
    this.scaleKey.set(k);
  }

  setPattern(p: string): void {
    this.pattern.set(p);
  }

  setBpm(v: number): void {
    this.bpm.set(this.clampNum(v, 40, 208));
  }

  playScale(): void {
    this.stopAudio();
    const ctx = this.ensureCtx();
    const seq = this.sequence();
    const beat = 60 / this.bpm();
    const t0 = ctx.currentTime + 0.05;
    seq.forEach((midi, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const g = ctx.createGain();
      const start = t0 + i * beat;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + beat * 0.9);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + beat);
      this.activeOscs.push(osc);
    });
    this.playing.set(true);
    this.playTimer = setTimeout(() => this.playing.set(false), seq.length * beat * 1000 + 300);
  }

  stopAudio(): void {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    for (const o of this.activeOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    this.activeOscs = [];
    this.playing.set(false);
  }

  ngOnDestroy(): void {
    this.stopAudio();
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
